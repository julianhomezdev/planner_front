import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';

@Component({
  selector: 'contract-detail-page',

  standalone: true,

  imports: [CommonModule, RouterModule],

  templateUrl: './contract-detail-component.html',
})

// Pagina para ver el detalle de cada contrato
export class ContractDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);

  private readonly projectService = inject(ProjectService);

  private readonly router = inject(Router);

  contract: any = null;

  charging = true;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.projectService.getProjectById(id).subscribe({
      next: (data) => {
        console.log(data);

        this.contract = data;

        this.charging = false;
      },

      error: (err) => {
        this.charging = false;
      },
    });
  }

  // Ir atras -> dashboard de proyectos
  goBack(): void {
    this.router.navigate(['/projects-dashboard']);
  }

  // Nabegar a agregar ODS al contrato
  navigateAddOds(): void {
    const projectId = this.contract?.id;

    if (projectId) {
      this.router.navigate(['/projects', projectId, 'add-ods']);
    }
  }

  navigateAddPlan(ods: any): void {
    const contractId = this.contract?.id;
    if (contractId && ods.id) {
      this.router.navigate(['/contracts', contractId, 'service-orders', ods.id, 'add-plans'], {
        queryParams: {
          startDate: ods.startDate,
          endDate: ods.endDate,
        },
      });
    }
  }

  navegarAAsignarRecursos(planId: number, proyectoId: number): void {
    let odsIndex = -1;

    if (this.contract?.serviceOrders) {
      for (let i = 0; i < this.contract.serviceOrders.length; i++) {
        const ods = this.contract.serviceOrders[i];
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
        odsIndex,
      },
    });
  }

  /**verProyecto(proyectoId: number): void {
        this.projectService.getProjectById(proyectoId).subscribe({
        next: (datos: any) => {
            this.proyectoSeleccionado = datos;
            this.showResourceEditModal = true;
        },
        error: (error: any) => {
            console.error('Error al cargar el detalle del proyecto:', error);
        },
        });
    }**/
}
