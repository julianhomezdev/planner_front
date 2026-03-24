import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { ProjectService } from '../../../core/services/project.service';

// ─── Interfaces locales ───────────────────────────────────────────────────────

interface ContratoInfo {
  id: number;
  contractCode: string;
  contractName: string;
  initialDate: string;
  finalDate: string;
}

interface PlanResumen {
  planCode: string;
  planName: string;
}

interface ProyectoResumen {
  id: number;
  projectName: string;
  contract: ContratoInfo;
  client: { id: number; name: string };
  initialDate: string;
  finalDate: string;
  totalServiceOrders: number;
  totalSamplingPlans: number;
  samplingPlans: PlanResumen[];
  projectResourceAssignementMode: number;
  serviceOrders?: any[];
}

interface GrupoContrato {
  contrato: ContratoInfo;
  proyectos: ProyectoResumen[];
  abierto: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'project-dashboard-component',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './project-dashboard.component.html',
  styleUrls: ['./project-dashboard.component.css']
})
export class ProjectDashboardComponent implements OnInit {

  // ─── Dependencias ─────────────────────────────────────────────────────────

  private readonly projectService = inject(ProjectService);
  private readonly router         = inject(Router);

  // ─── Estado del componente ────────────────────────────────────────────────

  proyectos: ProyectoResumen[] = [];
  proyectoSeleccionado: any = null;

  cargando = true;

  // Filtros
  filtroFechaInicio: string = '';
  filtroFechaFin:    string = '';
  filtroBusqueda:    string = '';

  // Grupos principales (fuente de verdad tras cargar datos)
  grupos: GrupoContrato[] = [];

  // Grupos filtrados (los que se muestran en el template)
  gruposFiltrados: GrupoContrato[] = [];

  // Controla qué ODS están abiertas/cerradas
  odsAbiertos: Record<string, boolean> = {};

  // ─── Ciclo de vida ────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.cargarProyectos();
  }

  // ─── Carga de datos ───────────────────────────────────────────────────────

  cargarProyectos(): void {
    this.cargando = true;

    this.projectService.getAllProjects().subscribe({
      next: (datos: ProyectoResumen[]) => {
        this.proyectos = datos;
        this.grupos = this.construirGrupos(datos);
        this.inicializarEstados();
        this.gruposFiltrados = this.grupos.map(g => ({ ...g }));
        this.cargando = false;
      },
      error: (error: any) => {
        console.error('Error al cargar proyectos:', error);
        this.cargando = false;
      }
    });
  }

  verProyecto(proyectoId: number): void {
    this.projectService.getProjectById(proyectoId).subscribe({
      next: (datos: any) => {
        this.proyectoSeleccionado = datos;
      },
      error: (error: any) => {
        console.error('Error al cargar el detalle del proyecto:', error);
      }
    });
  }

  // ─── Construcción de grupos ───────────────────────────────────────────────

  private construirGrupos(proyectos: ProyectoResumen[]): GrupoContrato[] {
    const mapa = new Map<number, GrupoContrato>();

    for (const proyecto of proyectos) {
      const contratoId = proyecto.contract?.id;

      if (!mapa.has(contratoId)) {
        mapa.set(contratoId, {
          contrato: proyecto.contract,
          proyectos: [],
          abierto: true
        });
      }

      mapa.get(contratoId)!.proyectos.push(proyecto);
    }

    return Array.from(mapa.values());
  }

  // ─── Inicializar estado abierto/cerrado ───────────────────────────────────

  inicializarEstados(): void {
    this.grupos.forEach(grupo => {
      grupo.abierto = true;

      grupo.proyectos.forEach(proyecto => {
        proyecto.serviceOrders?.forEach((orden: any) => {
          this.odsAbiertos[orden.id] = false;
        });
      });
    });
  }

  // ─── Colapsar / expandir contrato ────────────────────────────────────────

  toggleContrato(grupo: GrupoContrato): void {
    grupo.abierto = !grupo.abierto;

    // Sincronizar en gruposFiltrados
    const grupoFiltrado = this.gruposFiltrados.find(
      g => g.contrato.id === grupo.contrato.id
    );
    if (grupoFiltrado) {
      grupoFiltrado.abierto = grupo.abierto;
    }
  }

  // ─── Colapsar / expandir ODS ─────────────────────────────────────────────

  toggleODS(odsId: string): void {
    this.odsAbiertos[odsId] = !this.odsAbiertos[odsId];
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────

  aplicarFiltros(): void {
    const q = this.filtroBusqueda.toLowerCase().trim();

    let base = this.grupos;

    // Filtro por rango de fechas sobre los proyectos
    if (this.filtroFechaInicio || this.filtroFechaFin) {
      const inicio = this.filtroFechaInicio ? new Date(this.filtroFechaInicio) : null;
      const fin    = this.filtroFechaFin    ? new Date(this.filtroFechaFin)    : null;

      base = base.map(grupo => ({
        ...grupo,
        proyectos: grupo.proyectos.filter(proyecto => {
          const fechaInicioProyecto = proyecto.initialDate ? new Date(proyecto.initialDate) : null;
          const fechaFinProyecto    = proyecto.finalDate   ? new Date(proyecto.finalDate)   : null;

          if (inicio && fechaFinProyecto    && fechaFinProyecto    < inicio) return false;
          if (fin    && fechaInicioProyecto && fechaInicioProyecto > fin)    return false;

          return true;
        })
      })).filter(g => g.proyectos.length > 0);
    }

    // Filtro por texto
    if (q) {
      base = base.map(grupo => ({
        ...grupo,
        proyectos: grupo.proyectos.filter(p => {
          const matchNombre = p.projectName?.toLowerCase().includes(q);
          const matchPlan   = (p.samplingPlans ?? []).some(plan =>
            plan.planCode?.toLowerCase().includes(q) ||
            plan.planName?.toLowerCase().includes(q)
          );
          const matchODS = p.serviceOrders?.some((o: any) =>
            o.samplingPlans?.some(
              (pl: any) =>
                pl.planCode?.toLowerCase().includes(q) ||
                pl.planName?.toLowerCase().includes(q)
            )
          );
          return matchNombre || matchPlan || matchODS;
        })
      })).filter(g => g.proyectos.length > 0);
    }

    this.gruposFiltrados = base;
  }

  limpiarFiltros(): void {
    this.filtroFechaInicio = '';
    this.filtroFechaFin    = '';
    this.filtroBusqueda    = '';
    this.gruposFiltrados   = this.grupos.map(g => ({ ...g }));
  }

  // ─── Contadores ───────────────────────────────────────────────────────────

  totalProyectos(): number {
    return this.grupos.reduce((sum, g) => sum + g.proyectos.length, 0);
  }

  totalProyectosVisibles(): number {
    return this.gruposFiltrados.reduce((sum, g) => sum + g.proyectos.length, 0);
  }

  contarPendientes(): number {
    return this.grupos.reduce((sum, g) =>
      sum + g.proyectos.filter(p => p.projectResourceAssignementMode === 0).length, 0);
  }

  contarAsignados(): number {
    return this.grupos.reduce((sum, g) =>
      sum + g.proyectos.filter(p => p.projectResourceAssignementMode !== 0).length, 0);
  }

  // ─── Navegación ───────────────────────────────────────────────────────────

  crearNuevoProyecto(): void {
    this.router.navigate(['/planner']);
  }

  navegarAAsignarRecursos(planId: number, proyectoId: number): void {
    let odsIndex = -1;

    if (this.proyectoSeleccionado?.serviceOrders) {
      for (let i = 0; i < this.proyectoSeleccionado.serviceOrders.length; i++) {
        const ods = this.proyectoSeleccionado.serviceOrders[i];
        if (ods.samplingPlans?.some((p: any) => p.id === planId)) {
          odsIndex = i;
          break;
        }
      }
    }

    this.router.navigate(['/planner'], {
      queryParams: {
        mode: 'edit-resources',
        projectId: proyectoId,
        planId,
        odsIndex
      }
    });
  }

  navegarAAsignarDesdeCard(proyecto: ProyectoResumen, evento: Event): void {
    evento.stopPropagation();

    if (proyecto.serviceOrders?.length) {
      this.irAlPrimerPlanPendiente(proyecto.id, proyecto.serviceOrders);
    } else {
      this.projectService.getProjectById(proyecto.id).subscribe({
        next: (proyectoCompleto: any) =>
          this.irAlPrimerPlanPendiente(proyecto.id, proyectoCompleto.serviceOrders),
        error: (err: any) => console.error('Error al cargar el proyecto:', err)
      });
    }
  }

  // ─── Modal de detalle ─────────────────────────────────────────────────────

  cerrarModal(): void {
    this.proyectoSeleccionado = null;
  }

  // ─── Eliminación ──────────────────────────────────────────────────────────

  eliminarProyecto(proyectoId: number): void {
    if (!confirm('¿Está seguro de eliminar este proyecto?')) return;

    this.projectService.deleteProject(proyectoId).subscribe({
      next: () => {
        this.proyectos = this.proyectos.filter(p => p.id !== proyectoId);
        this.grupos = this.construirGrupos(this.proyectos);
        this.aplicarFiltros();
      },
      error: (error: any) => {
        console.error('Error al eliminar el proyecto:', error);
      }
    });
  }

  // ─── Helpers de visualización ─────────────────────────────────────────────

  esModoNominal(plan: any): boolean {
    return plan.resourceAssignmentMode?.toUpperCase() === 'QUANTITY';
  }

  calcularMargen(presupuesto: any): number {
    if (!presupuesto?.totalBilled || presupuesto.totalBilled === 0) return 0;
    return ((presupuesto.totalProfit ?? 0) / presupuesto.totalBilled) * 100;
  }

  obtenerNombresEmpleados(empleados: any[]): string {
    return empleados
      .map(e => `${e.firstName} ${e.lastName ?? ''}`.trim())
      .join(', ');
  }

  obtenerNombresEquipos(equipos: any[]): string {
    return equipos.map(e => `${e.name} (${e.code})`).join(', ');
  }

  obtenerPlacasVehiculos(vehiculos: any[]): string {
    return vehiculos.map(v => v.plateNumber).join(', ');
  }

  // ─── Exportación a Excel ──────────────────────────────────────────────────

  exportarAExcel(): void {
    const todosLosProyectos = this.gruposFiltrados.flatMap(g => g.proyectos);

    if (todosLosProyectos.length === 0) {
      alert('No hay proyectos para exportar');
      return;
    }

    this.cargando = true;

    const peticiones = todosLosProyectos.map(p =>
      this.projectService.getProjectById(p.id).toPromise()
    );

    Promise.all(peticiones)
      .then(proyectosDetallados => {
        const datos = this.prepararDatosExcel(proyectosDetallados);
        const hoja  = XLSX.utils.json_to_sheet(datos);

        hoja['!cols'] = Array(31).fill({ wch: 15 });

        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Proyectos');
        XLSX.writeFile(libro, `Proyectos_${this.obtenerNombreArchivoExport()}.xlsx`);

        this.cargando = false;
      })
      .catch(error => {
        console.error('Error al cargar detalles para exportar:', error);
        alert('Error al cargar los detalles de los proyectos');
        this.cargando = false;
      });
  }

  // ─── Métodos privados ─────────────────────────────────────────────────────

  private irAlPrimerPlanPendiente(proyectoId: number, ordenesDeServicio: any[]): void {
    for (let odsIndex = 0; odsIndex < ordenesDeServicio.length; odsIndex++) {
      const planPendiente = ordenesDeServicio[odsIndex].samplingPlans?.find(
        (p: any) => this.esModoNominal(p)
      );

      if (planPendiente) {
        this.router.navigate(['/planner'], {
          queryParams: {
            mode: 'edit-resources',
            projectId: proyectoId,
            planId: planPendiente.id,
            odsIndex
          }
        });
        return;
      }
    }
  }

  private prepararDatosExcel(proyectos: any[]): any[] {
    const filas: any[] = [];

    proyectos.forEach(proyecto => {
      if (!proyecto.serviceOrders?.length) {
        filas.push(this.crearFilaExcel(proyecto, null, null));
        return;
      }

      proyecto.serviceOrders.forEach((ods: any) => {
        if (!ods.samplingPlans?.length) {
          filas.push(this.crearFilaExcel(proyecto, ods, null));
          return;
        }
        ods.samplingPlans.forEach((plan: any) => {
          filas.push(this.crearFilaExcel(proyecto, ods, plan));
        });
      });
    });

    return filas;
  }

  private crearFilaExcel(proyecto: any, ods: any | null, plan: any | null): any {
    const fila: any = {
      'Proyecto':              proyecto.projectName        ?? 'Sin nombre',
      'Codigo Contrato':       proyecto.contract?.contractCode ?? '',
      'Cliente':               proyecto.client?.name       ?? '',
      'Coordinador':           proyecto.coordinator?.name  ?? '',
      'Fecha Inicio Proyecto': proyecto.initialDate        ?? '',
      'Fecha Fin Proyecto':    proyecto.finalDate          ?? '',
      'Codigo ODS':            ods?.odsCode   ?? '',
      'Nombre ODS':            ods?.odsName   ?? '',
      'Fecha Inicio ODS':      ods?.startDate ?? '',
      'Fecha Fin ODS':         ods?.endDate   ?? '',
      'Codigo Plan':           plan?.planCode  ?? '',
      'Fecha Inicio Plan':     plan?.startDate ?? '',
      'Fecha Fin Plan':        plan?.endDate   ?? '',
      'Sitios':   plan?.sites?.map((s: any) => `${s.name} (${s.matrixName})`).join('; ') ?? '',
      'Personal': plan?.resources?.employees ? this.obtenerNombresEmpleados(plan.resources.employees) : '',
      'Equipos':  plan?.resources?.equipment ? this.obtenerNombresEquipos(plan.resources.equipment)  : '',
      'Vehiculos': plan?.resources?.vehicles ? this.obtenerPlacasVehiculos(plan.resources.vehicles)  : '',
    };

    const p = plan?.budget ?? {};
    fila['Costo Transporte']             = p.transportCostChemilab          ?? 0;
    fila['Facturado Transporte']         = p.transportBilledToClient        ?? 0;
    fila['Costo Logistica']              = p.logisticsCostChemilab          ?? 0;
    fila['Facturado Logistica']          = p.logisticsBilledToClient        ?? 0;
    fila['Costo Subcontratacion']        = p.subcontractingCostChemilab     ?? 0;
    fila['Facturado Subcontratacion']    = p.subcontractingBilledToClient   ?? 0;
    fila['Costo Transporte Fluvial']     = p.fluvialTransportCostChemilab   ?? 0;
    fila['Facturado Transporte Fluvial'] = p.fluvialTransportBilledToClient ?? 0;
    fila['Costo Informes']               = p.reportsCostChemilab            ?? 0;
    fila['Facturado Informes']           = p.reportsBilledToClient          ?? 0;
    fila['Costo Total']                  = p.totalCost                      ?? 0;
    fila['Total Facturado']              = p.totalBilled                    ?? 0;
    fila['Utilidad']                     = p.totalProfit                    ?? 0;
    fila['Margen %']                     = this.calcularMargen(p);
    fila['Notas Presupuesto']            = p.notes                          ?? '';

    return fila;
  }

  private obtenerNombreArchivoExport(): string {
    const hoy = new Date().toISOString().split('T')[0];
    if (this.filtroFechaInicio && this.filtroFechaFin) return `${this.filtroFechaInicio}_a_${this.filtroFechaFin}`;
    if (this.filtroFechaInicio) return `desde_${this.filtroFechaInicio}`;
    if (this.filtroFechaFin)    return `hasta_${this.filtroFechaFin}`;
    return hoy;
  }
  
  navegarAgregarOds(contratoId: number, evento: Event): void {
    
    
    evento.stopPropagation();
    
    const grupo = this.grupos.find( g => g.contrato.id === contratoId);
    
    const proyectoId = grupo?.proyectos[0]?.id;
    
    if(proyectoId) {     
      
      this.router.navigate(['/projects', proyectoId, 'add-ods']);
      
    }   
  }
  
  
  
  getPlanesDelContrato(grupo: GrupoContrato): { planCode: string; planName: string }[] {
    return grupo.proyectos
      .flatMap(p => p.serviceOrders ?? [])
      .flatMap((o: any) => o.samplingPlans ?? [])
      .map((sp: any) => ({ planCode: sp.planCode, planName: sp.planName }));
  }
  
}