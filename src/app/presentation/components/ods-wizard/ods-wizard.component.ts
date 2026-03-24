import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, FormGroup, ReactiveFormsModule,
  Validators, FormsModule, FormArray
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

import { EmployeeService }            from '../../../core/services/employee.service';
import { EquipmentService }           from '../../../core/services/equipment.service';
import { VehicleService }             from '../../../core/services/vehicle.service';
import { MatrixService }              from '../../../core/services/matrix.service';
import { ProjectCoordinatorService }  from '../../../core/services/project-coordinator.service';
import { ProjectCreationService }     from '../../../core/services/project-creation.service';
import { ProjectService }             from '../../../core/services/project.service';
import { OrderServiceService }        from '../../../core/services/order-service..service';

import { Employee }    from '../../../domain/Entities/employee/employee.model';
import { Vehicle }     from '../../../domain/Entities/vehicle/vehicle.model';
import { Equipment }   from '../../../domain/Entities/Equipment/equipment.model';
import { Coordinator } from '../../../domain/Entities/coordinator/coordinator.model';
import { Matrix }      from '../../../domain/Entities/matrix/matrix.model';
import { ReusableOdsSummary } from '../../../domain/Entities/orderService/reusable-ods-summary.model';
import { ResourceAssignmentMode }     from '../../../domain/enums/resource-assignment-mode.enum';
import { EmployeeMonthlyAvailability } from '../../../domain/Entities/employee/employee-monthly-availabilty.model';

// ─── Enums y tipos locales ────────────────────────────────────────────────────

enum ViewMode { ODS_FORM = 'ods_form', PLAN_FORM = 'plan_form' }

enum BudgetCategory {
  TRANSPORT        = 'TRANSPORTE',
  LOGISTICS        = 'LOGÍSTICA',
  SUBCONTRACTING   = 'SUBCONTRATACIÓN',
  RIVER_TRANSPORT  = 'TRANSPORTE FLUVIAL',
  REPORTS          = 'INFORMES'
}

interface ResourceQuantity { categoryName: string; quantity: number; }

interface BudgetItem {
  id: string;
  category: BudgetCategory;
  concept: string;
  provider?: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  billedPerUnit: number;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-add-ods-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './ods-wizard.component.html',
})

export class AddOdsWizardComponent implements OnInit, OnDestroy {

  // ── Inyecciones ────────────────────────────────────────────────────────────
  private fb                  = inject(FormBuilder);
  private router              = inject(Router);
  private route               = inject(ActivatedRoute);
  private employeeService     = inject(EmployeeService);
  private equipmentService    = inject(EquipmentService);
  private vehicleService      = inject(VehicleService);
  private matrixService       = inject(MatrixService);
  private coordinatorService  = inject(ProjectCoordinatorService);
  private projectCreationService = inject(ProjectCreationService);
  private projectService      = inject(ProjectService);
  private odsService          = inject(OrderServiceService);

  // ── Exposición de enums al template ───────────────────────────────────────
  ViewMode               = ViewMode;
  BudgetCategory         = BudgetCategory;
  ResourceAssignmentMode = ResourceAssignmentMode;
  Math                   = Math;

  // ── Estado general ────────────────────────────────────────────────────────
  projectId!: number;
  projectInfo: any = null;           // datos básicos del proyecto (nombre, contrato)
  currentView: ViewMode = ViewMode.ODS_FORM;

  loading        = false;
  dataReady      = false;
  errorMessage   = '';
  successMessage = '';

  // ── Formularios ───────────────────────────────────────────────────────────
  odsForm!:        FormGroup;
  planForm!:       FormGroup;
  budgetItemForm!: FormGroup;

  // ── ODS en construcción ───────────────────────────────────────────────────
  /** La única ODS que estamos construyendo en este wizard */
  currentOds: any = null;
  /** Índice del plan que se está editando (dentro de currentOds.samplingPlans) */
  editingPlanLocalIndex: number | null = null;

  odsCreationMode: 'new' | 'reuse' = 'new';
  selectedReusableOdsCode: string | null = null;
  loadingReusableOds = false;
  odsSameDatesAsProject = false;

  // ── Catálogos ─────────────────────────────────────────────────────────────
  employees:       Employee[]    = [];
  equipment:       Equipment[]   = [];
  vehicles:        Vehicle[]     = [];
  matrices:        Matrix[]      = [];
  coordinators:    Coordinator[] = [];
  reusableOdsList: ReusableOdsSummary[] = [];

  employeeCategories: string[] = [];
  equipmentCategories: string[] = [];

  // ── Recursos disponibles (por fecha) ──────────────────────────────────────
  availableEmployees: any[] = [];
  availableEquipment: any[] = [];
  availableVehicles:  any[] = [];
  resourceDatesSet = false;
  employeeMonthlyAvailability: Map<number, EmployeeMonthlyAvailability> = new Map();

  // ── Modo de asignación ────────────────────────────────────────────────────
  currentResourceMode: ResourceAssignmentMode = ResourceAssignmentMode.QUANTITY;
  employeeQuantities:  ResourceQuantity[] = [];
  equipmentQuantities: ResourceQuantity[] = [];
  vehicleQuantity = 0;

  // ── Filtros de búsqueda ───────────────────────────────────────────────────
  employeeSearchTerm    = '';
  equipmentSearchTerm   = '';
  vehicleSearchTerm     = '';
  employeeCategoryFilter = '';
  equipmentCategoryFilter = '';
  vehicleLocationFilter  = '';

  // ── Presupuesto ───────────────────────────────────────────────────────────
  showBudgetItemModal    = false;
  editingBudgetItemIndex = -1;

  // ── UI extras ─────────────────────────────────────────────────────────────
  expandedPlanIndex = -1;

  private destroy$           = new Subject<void>();
  private resourcesLoadedCount = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // CICLO DE VIDA
  // ═══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('projectId'));
    this.initializeForms();
    this.loadCatalogs();
    this.loadProjectInfo();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGA DE DATOS
  // ═══════════════════════════════════════════════════════════════════════════

  private loadProjectInfo(): void {
    this.projectService.getProjectById(this.projectId).subscribe({
      next: (p: any) => { this.projectInfo = p; },
      error: ()       => { /* silencioso, no crítico */ }
    });
  }

  loadCatalogs(): void {
    this.loading = true;
    Promise.all([
      this.employeeService.getAllEmployees().toPromise(),
      this.equipmentService.getAllEquipment().toPromise(),
      this.vehicleService.getAllVehicles().toPromise(),
      this.matrixService.getAllMatrix().toPromise(),
      this.coordinatorService.getAllCoordinators().toPromise(),
      this.odsService.getReusableOdsList().toPromise()
    ]).then(([employees, equipment, vehicles, matrices, coordinators, reusableOds]) => {
      this.employees       = employees       || [];
      this.equipment       = equipment       || [];
      this.vehicles        = vehicles        || [];
      this.matrices        = matrices        || [];
      this.coordinators    = coordinators    || [];
      this.reusableOdsList = reusableOds     || [];

      this.employeeCategories  = [...new Set(this.employees.map(e => e.position).filter(Boolean))];
      this.equipmentCategories = [...new Set(this.equipment.map(e => e.name).filter(Boolean))];

      this.dataReady = true;
      this.loading   = false;
    }).catch(() => {
      this.errorMessage = 'Error al cargar los datos necesarios';
      this.loading = false;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INICIALIZACIÓN DE FORMULARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  initializeForms(): void {
    this.odsForm = this.fb.group({
      odsCode:   ['', Validators.required],
      odsName:   [''],
      odsValue:  [0, [Validators.required, Validators.min(0)]],
      startDate: [''],
      endDate:   ['']
    });

    this.planForm = this.fb.group({
      planCode:           ['', Validators.required],
      planName:           ['', Validators.required],
      startDate:          [''],
      endDate:            [''],
      totalSites:         [1, [Validators.required, Validators.min(1)]],
      selectedMatrixIds:  [[], Validators.required],
      hasReport:          [false],
      hasGDB:             [false],
      coordinatorId:      ['', Validators.required],
      sites:              this.fb.array([]),
      resourceAssignmentMode: [ResourceAssignmentMode.QUANTITY],
      employeeQuantities: [[]],
      equipmentQuantities:[[]],
      vehicleQuantity:    [0],
      resourceStartDate:  [''],
      resourceEndDate:    [''],
      selectedEmployeeIds:[[]],
      selectedEquipmentIds:[[]],
      selectedVehicleIds: [[]],
      budgetItems:        [[]],
      notes:              ['']
    });

    this.budgetItemForm = this.fb.group({
      category:     [BudgetCategory.TRANSPORT, Validators.required],
      concept:      ['', Validators.required],
      provider:     [''],
      quantity:     [1, [Validators.required, Validators.min(1)]],
      unit:         ['días', Validators.required],
      costPerUnit:  [0, [Validators.required, Validators.min(0)]],
      billedPerUnit:[0, [Validators.required, Validators.min(0)]],
      notes:        ['']
    });

    this.addSite();

    // Cargar recursos cuando cambian las fechas
    this.planForm.get('resourceStartDate')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadAvailableResources());

    this.planForm.get('resourceEndDate')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadAvailableResources());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 1 — FORMULARIO ODS
  // ═══════════════════════════════════════════════════════════════════════════

  setOdsCreationMode(mode: 'new' | 'reuse'): void {
    this.odsCreationMode = mode;
    this.selectedReusableOdsCode = null;
    if (mode === 'new') this.odsForm.reset({ odsValue: 0 });
  }

  onOdsSameDatesChange(): void {
    if (this.odsSameDatesAsProject && this.projectInfo) {
      this.odsForm.patchValue({
        startDate: this.projectInfo.initialDate || '',
        endDate:   this.projectInfo.finalDate   || ''
      });
    } else {
      this.odsForm.patchValue({ startDate: '', endDate: '' });
    }
  }

  /** Confirma los datos de la ODS y avanza al formulario de planes */
  confirmarOds(): void {
    if (!this.odsForm.valid) {
      this.errorMessage = 'Ingrese al menos el código de la ODS';
      return;
    }

    this.currentOds = {
      odsCode:       this.odsForm.value.odsCode,
      odsName:       this.odsForm.value.odsName || this.odsForm.value.odsCode,
      odsValue:      this.odsForm.value.odsValue || 0,
      startDate:     this.odsForm.value.startDate,
      endDate:       this.odsForm.value.endDate,
      samplingPlans: []
    };

    this.errorMessage = '';
    this.currentView  = ViewMode.PLAN_FORM;

    // Pre-llenar fechas del plan con las de la ODS
    this.planForm.patchValue({
      startDate:         this.currentOds.startDate || '',
      endDate:           this.currentOds.endDate   || '',
      resourceStartDate: this.currentOds.startDate || '',
      resourceEndDate:   this.currentOds.endDate   || ''
    });
  }

  /** Crea la ODS reutilizando configuración existente */
  confirmarOdsReusable(): void {
    if (!this.odsForm.valid || !this.selectedReusableOdsCode) {
      this.errorMessage = 'Complete el código y seleccione una ODS a reutilizar';
      return;
    }

    this.loadingReusableOds = true;

    this.odsService.getReusableOds(this.selectedReusableOdsCode).subscribe({
      next: (reusableOds: any) => {
        this.currentOds = {
          odsCode:       this.odsForm.value.odsCode,
          odsName:       this.odsForm.value.odsName || reusableOds.odsName || this.odsForm.value.odsCode,
          odsValue:      this.odsForm.value.odsValue || 0,
          startDate:     this.odsForm.value.startDate,
          endDate:       this.odsForm.value.endDate,
          samplingPlans: this.mapReusablePlans(reusableOds.samplingPlans || [])
        };

        this.errorMessage       = '';
        this.loadingReusableOds = false;
        this.currentView        = ViewMode.PLAN_FORM;

        this.successMessage = `${this.currentOds.samplingPlans.length} planes precargados desde la ODS reutilizada`;
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: () => {
        this.errorMessage       = 'Error al cargar la ODS reutilizable';
        this.loadingReusableOds = false;
      }
    });
  }

  private mapReusablePlans(reusablePlans: any[]): any[] {
    return reusablePlans.map(plan => ({
      planCode:   plan.planCode  || '',
      planName:   plan.planName  || '',
      startDate:  null,
      endDate:    null,
      matrixIds:  [...new Set((plan.sites || []).map((s: any) => s.matrixId).filter(Boolean))],
      matrixNames:[...new Set((plan.sites || []).map((s: any) => s.matrixName).filter(Boolean))].join(', '),
      coordinatorId: null,
      hasReport:  plan.sites?.[0]?.hasReport || false,
      hasGDB:     plan.sites?.[0]?.hasGDB    || false,
      sites: (plan.sites || []).map((site: any) => ({
        name:              site.name       || '',
        matrixId:          site.matrixId   || null,
        matrixName:        site.matrixName || '',
        isSubcontracted:   false,
        subcontractorName: null,
        executionDate:     null,
        hasReport:         site.hasReport  || false,
        hasGDB:            site.hasGDB     || false
      })),
      resources: {
        startDate: null, endDate: null,
        employeeIds: [], equipmentIds: [], vehicleIds: [],
        employees: [], equipment: [], vehicles: []
      },
      budget: { items: [], notes: '' }
    }));
  }

  volverAOds(): void {
    this.currentView = ViewMode.ODS_FORM;
    this.resetPlanForm();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 2 — PLANES DE MUESTREO
  // ═══════════════════════════════════════════════════════════════════════════

  generateMultipleSites(): void {
    const count    = this.planForm.value.totalSites || 1;
    const planCode = this.planForm.value.planCode;
    const planName = this.planForm.value.planName;

    if (!planCode || !planName) {
      this.errorMessage = 'Complete el código y nombre del plan antes de generar sitios';
      return;
    }

    this.sitesArray.clear();

    for (let i = 0; i < count; i++) {
      this.sitesArray.push(this.buildSiteGroup(`Sitio #${i + 1} ${planName}-${planCode}`));
    }
  }

  private buildSiteGroup(name = ''): FormGroup {
    const g = this.fb.group({
      name:              [name],
      matrixId:          [''],
      isSubcontracted:   [false],
      subcontractorName: [''],
      executionDate:     [''],
      hasReport:         [false],
      hasGDB:            [false]
    });
    g.get('isSubcontracted')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(val => {
        const ctrl = g.get('subcontractorName');
        val ? ctrl?.setValidators([Validators.required]) : ctrl?.clearValidators();
        ctrl?.updateValueAndValidity();
      });
    return g;
  }

  get sitesArray(): FormArray { return this.planForm.get('sites') as FormArray; }

  addSite(): void     { this.sitesArray.push(this.buildSiteGroup()); }
  removeSite(i: number): void { if (this.sitesArray.length > 1) this.sitesArray.removeAt(i); }

  toggleMatrixSelection(matrixId: number): void {
    const current = [...(this.planForm.value.selectedMatrixIds || [])];
    const idx = current.indexOf(matrixId);
    idx === -1 ? current.push(matrixId) : current.splice(idx, 1);
    this.planForm.patchValue({ selectedMatrixIds: current });
  }

  isMatrixSelected(matrixId: number): boolean {
    return (this.planForm.value.selectedMatrixIds || []).includes(matrixId);
  }

  addPlanToOds(): void {
    if (!this.planForm.valid) { this.errorMessage = 'Complete los campos requeridos del plan'; return; }
    if (!this.sitesArray.length) { this.errorMessage = 'Agregue al menos un sitio'; return; }
    if (!(this.planForm.value.selectedMatrixIds?.length)) { this.errorMessage = 'Seleccione al menos una matriz'; return; }

    const mode = this.planForm.value.resourceAssignmentMode;

    if (mode === ResourceAssignmentMode.QUANTITY) {
      const hasR = this.employeeQuantities.some(e => e.categoryName && e.quantity > 0)
                || this.equipmentQuantities.some(e => e.categoryName && e.quantity > 0)
                || this.vehicleQuantity > 0;
      if (!hasR) { this.errorMessage = 'Agregue al menos un recurso'; return; }
    } else {
      if (!this.planForm.value.selectedEmployeeIds?.length) {
        this.errorMessage = 'Seleccione al menos un empleado'; return;
      }
    }

    const selectedMatrices = this.matrices.filter(m => this.planForm.value.selectedMatrixIds.includes(m.id));
    const coordinator      = this.coordinators.find(c => c.id === Number(this.planForm.value.coordinatorId));

    const sites = this.sitesArray.value.map((s: any) => ({
      name:              s.name,
      matrixIds:         this.planForm.value.selectedMatrixIds,
      matrixNames:       selectedMatrices.map(m => m.matrixName).join(', '),
      isSubcontracted:   s.isSubcontracted,
      subcontractorName: s.isSubcontracted ? (s.subcontractorName?.trim() || null) : null,
      executionDate:     s.executionDate || null,
      hasReport:         this.planForm.value.hasReport,
      hasGDB:            this.planForm.value.hasGDB
    }));

    const planData: any = {
      planCode:       this.planForm.value.planCode,
      planName:       this.planForm.value.planName,
      startDate:      this.planForm.value.startDate,
      endDate:        this.planForm.value.endDate,
      matrixIds:      this.planForm.value.selectedMatrixIds,
      matrixNames:    selectedMatrices.map(m => m.matrixName).join(', '),
      coordinatorId:  Number(this.planForm.value.coordinatorId),
      coordinatorName: coordinator?.name || '',
      hasReport:      this.planForm.value.hasReport,
      hasGDB:         this.planForm.value.hasGDB,
      sites,
      budget: { items: this.budgetItems, notes: this.planForm.value.notes }
    };

    if (mode === ResourceAssignmentMode.QUANTITY) {
      planData.resourceAssignmentMode  = 'quantity';
      planData.employeeQuantities      = this.employeeQuantities.filter(e => e.categoryName && e.quantity > 0);
      planData.equipmentQuantities     = this.equipmentQuantities.filter(e => e.categoryName && e.quantity > 0);
      planData.vehicleQuantity         = this.vehicleQuantity;
      planData.resourceStartDate       = this.planForm.value.resourceStartDate;
      planData.resourceEndDate         = this.planForm.value.resourceEndDate;
      planData.resources               = null;
    } else {
      planData.resourceAssignmentMode  = 'detailed';
      planData.employeeQuantities      = [];
      planData.equipmentQuantities     = [];
      planData.vehicleQuantity         = 0;
      planData.resourceStartDate       = this.planForm.value.resourceStartDate;
      planData.resourceEndDate         = this.planForm.value.resourceEndDate;
      planData.resources = {
        mode:         'DETAILED',
        startDate:    this.planForm.value.resourceStartDate,
        endDate:      this.planForm.value.resourceEndDate,
        employeeIds:  this.planForm.value.selectedEmployeeIds  || [],
        equipmentIds: this.planForm.value.selectedEquipmentIds || [],
        vehicleIds:   this.planForm.value.selectedVehicleIds   || [],
        employees:    this.employees.filter(e => (this.planForm.value.selectedEmployeeIds  || []).includes(e.id)),
        equipment:    this.equipment.filter(e => (this.planForm.value.selectedEquipmentIds || []).includes(e.id)),
        vehicles:     this.vehicles.filter(v => (this.planForm.value.selectedVehicleIds    || []).includes(v.id))
      };
    }

    if (this.editingPlanLocalIndex !== null) {
      this.currentOds.samplingPlans[this.editingPlanLocalIndex] = planData;
      this.editingPlanLocalIndex = null;
    } else {
      this.currentOds.samplingPlans.push(planData);
    }

    this.resetPlanForm();
    this.successMessage = 'Plan agregado correctamente';
    setTimeout(() => this.successMessage = '', 3000);
  }

  editPlan(index: number): void {
    const plan = this.currentOds.samplingPlans[index];
    this.editingPlanLocalIndex = index;

    this.sitesArray.clear();
    (plan.sites || []).forEach((s: any) => {
      this.sitesArray.push(this.buildSiteGroup(s.name));
      const g = this.sitesArray.at(this.sitesArray.length - 1) as FormGroup;
      g.patchValue(s);
    });
    if (!this.sitesArray.length) this.addSite();

    this.planForm.patchValue({
      planCode:          plan.planCode,
      planName:          plan.planName,
      startDate:         plan.startDate   || '',
      endDate:           plan.endDate     || '',
      selectedMatrixIds: plan.matrixIds   || [],
      hasReport:         plan.hasReport   || false,
      hasGDB:            plan.hasGDB      || false,
      coordinatorId:     plan.coordinatorId,
      totalSites:        plan.sites?.length || 1,
      budgetItems:       plan.budget?.items || [],
      resourceStartDate: plan.resourceStartDate || '',
      resourceEndDate:   plan.resourceEndDate   || ''
    });

    this.employeeQuantities  = plan.employeeQuantities  ? [...plan.employeeQuantities]  : [];
    this.equipmentQuantities = plan.equipmentQuantities ? [...plan.equipmentQuantities] : [];
    this.vehicleQuantity     = plan.vehicleQuantity     || 0;

    this.currentResourceMode = plan.resourceAssignmentMode === 'detailed'
      ? ResourceAssignmentMode.DETAILED
      : ResourceAssignmentMode.QUANTITY;
  }

  removePlan(index: number): void {
    this.currentOds.samplingPlans.splice(index, 1);
  }

  togglePlanDetails(index: number): void {
    this.expandedPlanIndex = this.expandedPlanIndex === index ? -1 : index;
  }

  resetPlanForm(): void {
    this.planForm.reset({
      startDate:          this.currentOds?.startDate || '',
      endDate:            this.currentOds?.endDate   || '',
      resourceStartDate:  this.currentOds?.startDate || '',
      resourceEndDate:    this.currentOds?.endDate   || '',
      resourceAssignmentMode: ResourceAssignmentMode.QUANTITY,
      employeeQuantities: [], equipmentQuantities: [],
      vehicleQuantity: 0,
      selectedEmployeeIds: [], selectedEquipmentIds: [], selectedVehicleIds: [],
      budgetItems: []
    });
    this.currentResourceMode    = ResourceAssignmentMode.QUANTITY;
    this.employeeQuantities     = [];
    this.equipmentQuantities    = [];
    this.vehicleQuantity        = 0;
    this.editingPlanLocalIndex  = null;
    this.sitesArray.clear();
    this.addSite();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURSOS
  // ═══════════════════════════════════════════════════════════════════════════

  setResourceMode(mode: ResourceAssignmentMode): void {
    this.currentResourceMode = mode;
    this.planForm.patchValue({ resourceAssignmentMode: mode });
    if (mode === ResourceAssignmentMode.DETAILED) {
      const s = this.planForm.value.resourceStartDate;
      const e = this.planForm.value.resourceEndDate;
      if (s && e) this.loadAvailableResources();
    }
  }

  loadAvailableResources(): void {
    const startDate = this.planForm.value.resourceStartDate;
    const endDate   = this.planForm.value.resourceEndDate;
    if (!startDate || !endDate) { this.resourceDatesSet = false; return; }

    this.resourceDatesSet    = true;
    this.loading             = true;
    this.resourcesLoadedCount = 0;

    const now = new Date();
    this.employeeService.getMonthlyAvailability(now.getFullYear(), now.getMonth() + 1).subscribe({
      next: av => this.employeeMonthlyAvailability = new Map(av.map(a => [a.employeeId, a])),
      error: ()  => this.employeeMonthlyAvailability = new Map()
    });

    this.employeeService.getAvailableEmployees(startDate, endDate).subscribe({
      next: avail => {
        this.availableEmployees = this.employees.map(e => ({
          ...e, isAvailable: avail?.find((a: any) => a.id === e.id)?.isAvailable ?? false
        }));
        this.checkAllLoaded();
      },
      error: () => { this.availableEmployees = this.employees.map(e => ({ ...e, isAvailable: false })); this.checkAllLoaded(); }
    });

    this.equipmentService.getAvailableEquipment(startDate, endDate).subscribe({
      next: avail => {
        this.availableEquipment = this.equipment.map(e => ({
          ...e, isAvailable: avail?.find((a: any) => a.id === e.id)?.isAvailable ?? false
        }));
        this.checkAllLoaded();
      },
      error: () => { this.availableEquipment = this.equipment.map(e => ({ ...e, isAvailable: false })); this.checkAllLoaded(); }
    });

    this.vehicleService.getAvailableVehicles(startDate, endDate).subscribe({
      next: avail => {
        this.availableVehicles = this.vehicles.map(v => ({
          ...v, isAvailable: avail?.find((a: any) => a.id === v.id)?.isAvailable ?? false
        }));
        this.checkAllLoaded();
      },
      error: () => { this.availableVehicles = this.vehicles.map(v => ({ ...v, isAvailable: false })); this.checkAllLoaded(); }
    });
  }

  private checkAllLoaded(): void {
    this.resourcesLoadedCount++;
    if (this.resourcesLoadedCount >= 3) { this.loading = false; this.resourcesLoadedCount = 0; }
  }

  // Filtros de recursos
  get filteredEmployees() {
    return this.availableEmployees.filter(e => {
      const t = this.employeeSearchTerm.toLowerCase();
      const matchText = !t || e.name?.toLowerCase().includes(t) || e.position?.toLowerCase().includes(t);
      const matchCat  = !this.employeeCategoryFilter || e.position === this.employeeCategoryFilter;
      return matchText && matchCat;
    });
  }

  get filteredEquipment() {
    return this.availableEquipment.filter(e => {
      const t = this.equipmentSearchTerm.toLowerCase();
      const matchText = !t || e.name?.toLowerCase().includes(t) || e.code?.toLowerCase().includes(t);
      const matchCat  = !this.equipmentCategoryFilter || e.name === this.equipmentCategoryFilter;
      return matchText && matchCat;
    });
  }

  get filteredVehicles() {
    return this.availableVehicles.filter(v => {
      const t = this.vehicleSearchTerm.toLowerCase();
      const matchText = !t || v.plateNumber?.toLowerCase().includes(t) || v.brand?.toLowerCase().includes(t);
      const matchLoc  = !this.vehicleLocationFilter || v.location === this.vehicleLocationFilter;
      return matchText && matchLoc;
    });
  }

  get uniqueEmployeeCategories(): string[] { return [...new Set(this.employees.map(e => e.position).filter(Boolean))]; }
  get uniqueEquipmentCategories(): string[] { return [...new Set(this.equipment.map(e => e.name).filter(Boolean))]; }
  get uniqueVehicleLocations():    string[] { return [...new Set(this.vehicles.map(v => v.location).filter(Boolean))]; }

  // Selección de recursos
  toggleEmployeeSelection(id: number):  void { this.toggleArrayItem('selectedEmployeeIds',  id); }
  toggleEquipmentSelection(id: number): void { this.toggleArrayItem('selectedEquipmentIds', id); }
  toggleVehicleSelection(id: number):   void {
    this.toggleArrayItem('selectedVehicleIds', id);
    const sel = (this.planForm.value.selectedVehicleIds || []).includes(id);
    sel ? this.addVehicleToBudget(id) : this.removeVehicleFromBudget(id);
  }

  isEmployeeSelected(id: number):  boolean { return (this.planForm.value.selectedEmployeeIds  || []).includes(id); }
  isEquipmentSelected(id: number): boolean { return (this.planForm.value.selectedEquipmentIds || []).includes(id); }
  isVehicleSelected(id: number):   boolean { return (this.planForm.value.selectedVehicleIds   || []).includes(id); }

  private toggleArrayItem(field: string, id: number): void {
    const current = [...(this.planForm.value[field] || [])];
    const idx = current.indexOf(id);
    idx === -1 ? current.push(id) : current.splice(idx, 1);
    this.planForm.patchValue({ [field]: current });
  }

  // Employee monthly availability helpers
  getEmployeeRemainingDays(id: number): number { return Math.max(0, this.employeeMonthlyAvailability.get(id)?.remainingDays ?? 20); }
  getEmployeeWorkedDays(id: number):    number { return this.employeeMonthlyAvailability.get(id)?.workedDays      ?? 0; }
  getEmployeeWorkDaysPerMonth(id: number): number { return this.employeeMonthlyAvailability.get(id)?.workDaysPerMonth ?? 20; }
  isEmployeeMonthFull(id: number):      boolean { return this.getEmployeeRemainingDays(id) <= 0; }
  getRemainingDaysColor(id: number):    string {
    const r = this.getEmployeeRemainingDays(id);
    return r <= 0 ? 'text-red-600' : r <= 5 ? 'text-amber-600' : 'text-emerald-600';
  }

  // Cantidades
  addEmployeeQuantity():    void { this.employeeQuantities.push({ categoryName: '', quantity: 1 }); this.syncQuantities(); }
  removeEmployeeQuantity(i: number): void { this.employeeQuantities.splice(i, 1); this.syncQuantities(); }
  addEquipmentQuantity():   void { this.equipmentQuantities.push({ categoryName: '', quantity: 1 }); this.syncQuantities(); }
  removeEquipmentQuantity(i: number): void { this.equipmentQuantities.splice(i, 1); this.syncQuantities(); }
  updateVehicleQuantity():  void { this.planForm.patchValue({ vehicleQuantity: this.vehicleQuantity }); }

  private syncQuantities(): void {
    this.planForm.patchValue({
      employeeQuantities:  [...this.employeeQuantities],
      equipmentQuantities: [...this.equipmentQuantities]
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESUPUESTO
  // ═══════════════════════════════════════════════════════════════════════════

  get budgetItems(): BudgetItem[] { return this.planForm.value.budgetItems || []; }
  get budgetCategories() { return Object.values(BudgetCategory); }

  openBudgetItemModal(): void {
    this.budgetItemForm.reset({ category: BudgetCategory.TRANSPORT, quantity: 1, unit: 'días', costPerUnit: 0, billedPerUnit: 0 });
    this.editingBudgetItemIndex = -1;
    this.showBudgetItemModal    = true;
  }

  editBudgetItem(i: number): void {
    this.budgetItemForm.patchValue(this.budgetItems[i]);
    this.editingBudgetItemIndex = i;
    this.showBudgetItemModal    = true;
  }

  saveBudgetItem(): void {
    if (!this.budgetItemForm.valid) return;
    const item: BudgetItem = {
      id: this.editingBudgetItemIndex === -1 ? this.generateId() : this.budgetItems[this.editingBudgetItemIndex].id,
      ...this.budgetItemForm.value
    };
    const items = [...this.budgetItems];
    this.editingBudgetItemIndex === -1 ? items.push(item) : (items[this.editingBudgetItemIndex] = item);
    this.planForm.patchValue({ budgetItems: items });
    this.closeBudgetItemModal();
  }

  removeBudgetItem(i: number): void {
    const items = [...this.budgetItems];
    items.splice(i, 1);
    this.planForm.patchValue({ budgetItems: items });
  }

  closeBudgetItemModal(): void {
    this.showBudgetItemModal    = false;
    this.editingBudgetItemIndex = -1;
    this.budgetItemForm.reset();
  }

  getCurrentBudgetCostTotal():   number { return this.budgetItems.reduce((s, i) => s + i.quantity * i.costPerUnit,   0); }
  getCurrentBudgetBilledTotal(): number { return this.budgetItems.reduce((s, i) => s + i.quantity * i.billedPerUnit, 0); }
  getCurrentBudgetProfit():      number { return this.getCurrentBudgetBilledTotal() - this.getCurrentBudgetCostTotal(); }

  getOdsBudgetSummary(): { used: number; available: number; percentage: number } {
    const odsValue = this.currentOds?.odsValue || 0;
    const used = (this.currentOds?.samplingPlans || []).reduce((sum: number, plan: any) =>
      sum + (plan.budget?.items || []).reduce((s: number, i: BudgetItem) => s + i.quantity * i.billedPerUnit, 0), 0);
    return { used, available: odsValue - used, percentage: odsValue > 0 ? (used / odsValue) * 100 : 0 };
  }

  private addVehicleToBudget(vehicleId: number): void {
    const v = this.availableVehicles.find(v => v.id === vehicleId);
    const s = this.planForm.value.resourceStartDate;
    const e = this.planForm.value.resourceEndDate;
    if (!v || !s || !e || !v.costPerDay) return;

    const days = this.calculateDays(s, e);
    const item: BudgetItem = {
      id: `vehicle-${vehicleId}`, category: BudgetCategory.TRANSPORT,
      concept: `Vehículo ${v.plateNumber} - ${v.brand} ${v.model}`,
      provider: v.plateNumber, quantity: days, unit: 'días',
      costPerUnit: v.costPerDay, billedPerUnit: v.costPerDay, notes: 'Auto-generado'
    };
    const items = [...this.budgetItems];
    if (!items.find(i => i.id === item.id)) {
      items.push(item);
      this.planForm.patchValue({ budgetItems: items });
    }
  }

  private removeVehicleFromBudget(vehicleId: number): void {
    this.planForm.patchValue({ budgetItems: this.budgetItems.filter(i => i.id !== `vehicle-${vehicleId}`) });
  }

  calculateDays(start: string, end: string): number {
    if (!start || !end) return 0;
    return Math.ceil(Math.abs(new Date(end).getTime() - new Date(start).getTime()) / 86400000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUARDAR — llamada al backend
  // ═══════════════════════════════════════════════════════════════════════════

  canFinalize(): boolean {
    return !!this.currentOds && this.currentOds.samplingPlans.length > 0;
  }

  finalizeOds(): void {
    if (!this.canFinalize()) {
      this.errorMessage = 'Agregue al menos un plan de muestreo antes de guardar';
      return;
    }

    this.loading      = true;
    this.errorMessage = '';

    const dto = this.buildOdsDto();

    this.projectCreationService.addServiceOrderToProject(this.projectId, dto).subscribe({
      next: () => {
        this.loading        = false;
        this.successMessage = '¡ODS creada exitosamente!';
        setTimeout(() => this.router.navigate(['/projects-dashboard']), 1500);
      },
      error: (err: any) => {
        this.errorMessage = err.error?.message || 'Error al guardar la ODS';
        this.loading      = false;
      }
    });
  }

  private buildOdsDto() {
    return {
      odsCode:   this.currentOds.odsCode,
      odsName:   this.currentOds.odsName,
      startDate: this.currentOds.startDate || null,
      endDate:   this.currentOds.endDate   || null,
      samplingPlans: this.currentOds.samplingPlans.map((plan: any) => ({
        planCode:      plan.planCode,
        planName:      plan.planName,
        startDate:     plan.startDate     || null,
        endDate:       plan.endDate       || null,
        coordinatorId: plan.coordinatorId,
        sites: plan.sites.map((s: any) => ({
          name:        s.name,
          matrixId:    Array.isArray(s.matrixIds) ? s.matrixIds[0] : (s.matrixId || 0),
          executionDate: s.executionDate || null,
          hasReport:   s.hasReport || false,
          hasGDB:      s.hasGDB    || false
        })),
        resources: {
          mode:              plan.resourceAssignmentMode?.toUpperCase() || 'QUANTITY',
          startDate:         plan.resourceStartDate || null,
          endDate:           plan.resourceEndDate   || null,
          employeeIds:       plan.resources?.employeeIds  || [],
          equipmentIds:      plan.resources?.equipmentIds || [],
          vehicleIds:        plan.resources?.vehicleIds   || [],
          employeeQuantities: plan.employeeQuantities  || [],
          equipmentQuantities: plan.equipmentQuantities || [],
          vehicleQuantity:   plan.vehicleQuantity || 0
        },
        budget: this.calculateBudgetTotals(plan.budget?.items || [])
      }))
    };
  }

  private calculateBudgetTotals(items: BudgetItem[]) {
    const t = {
      transportCostChemilab: 0,        transportBilledToClient: 0,
      logisticsCostChemilab: 0,        logisticsBilledToClient: 0,
      subcontractingCostChemilab: 0,   subcontractingBilledToClient: 0,
      fluvialTransportCostChemilab: 0, fluvialTransportBilledToClient: 0,
      reportsCostChemilab: 0,          reportsBilledToClient: 0,
      notes: ''
    };
    items.forEach(item => {
      const cost   = item.quantity * item.costPerUnit;
      const billed = item.quantity * item.billedPerUnit;
      switch (item.category) {
        case BudgetCategory.TRANSPORT:       t.transportCostChemilab += cost;       t.transportBilledToClient += billed;       break;
        case BudgetCategory.LOGISTICS:       t.logisticsCostChemilab += cost;       t.logisticsBilledToClient += billed;       break;
        case BudgetCategory.SUBCONTRACTING:  t.subcontractingCostChemilab += cost;  t.subcontractingBilledToClient += billed;  break;
        case BudgetCategory.RIVER_TRANSPORT: t.fluvialTransportCostChemilab += cost; t.fluvialTransportBilledToClient += billed; break;
        case BudgetCategory.REPORTS:         t.reportsCostChemilab += cost;         t.reportsBilledToClient += billed;         break;
      }
    });
    return t;
  }

  cancelar(): void { this.router.navigate(['/projects-dashboard']); }

  private generateId(): string { return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; }
}