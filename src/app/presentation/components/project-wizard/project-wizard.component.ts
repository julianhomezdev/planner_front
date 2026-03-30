import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormsModule,
  FormArray
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, interval, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

import { EmployeeService } from '../../../core/services/employee.service';
import { EquipmentService } from '../../../core/services/equipment.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { ClientService } from '../../../core/services/client.service';
import { ProjectCoordinatorService } from '../../../core/services/project-coordinator.service';
import { MatrixService } from '../../../core/services/matrix.service';
import { ProjectCreationService } from '../../../core/services/project-creation.service';
import { ProjectDraftService } from '../../../core/services/project-draft.service';


import { Employee } from '../../../domain/Entities/employee/employee.model';
import { Vehicle } from '../../../domain/Entities/vehicle/vehicle.model';
import { Equipment } from '../../../domain/Entities/Equipment/equipment.model';
import { Client } from '../../../domain/Entities/client/client.model';
import { Coordinator } from '../../../domain/Entities/coordinator/coordinator.model';
import { Matrix } from '../../../domain/Entities/matrix/matrix.model';
import { CreateProject } from '../../../domain/Entities/project/project-creation.model';
import { OrderServiceService } from '../../../core/services/order-service..service';
import { ReusableOds, ReusableOdsSummary } from '../../../domain/Entities/orderService/reusable-ods-summary.model';
import { ResourceAssignmentMode } from '../../../domain/enums/resource-assignment-mode.enum';
import { ProjectService } from '../../../core/services/project.service';
import { EmployeeMonthlyAvailability } from '../../../domain/Entities/employee/employee-monthly-availabilty.model';
import { ContractService } from '../../../core/services/contract.service';

enum ViewMode {
  CONTRACT = 'contract',
  ODS_LIST = 'ods_list',
  PLAN_FORM = 'plan_form'
}

enum BudgetCategory {
  TRANSPORT = 'TRANSPORTE',
  LOGISTICS = 'LOGÍSTICA',
  SUBCONTRACTING = 'SUBCONTRATACIÓN',
  RIVER_TRANSPORT = 'TRANSPORTE FLUVIAL',
  REPORTS = 'INFORMES'
}

interface ResourceQuantity {
  categoryName: string;
  quantity: number;
}

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

@Component({
  selector: 'app-project-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './project-wizard.component.html',
  styleUrls: ['./project-wizard.component.css']
})
export class ProjectWizardComponent implements OnInit, OnDestroy {

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private employeeService = inject(EmployeeService);
  private equipmentService = inject(EquipmentService);
  private vehicleService = inject(VehicleService);
  private clientService = inject(ClientService);
  private coordinatorService = inject(ProjectCoordinatorService);
  private matrixService = inject(MatrixService);
  private projectCreationService = inject(ProjectCreationService);
  private projectService = inject(ProjectService);
  private draftService = inject(ProjectDraftService);
  private route = inject(ActivatedRoute);
  private odsService = inject(OrderServiceService);
  private contractService = inject(ContractService);

  employeeMonthlyAvailability: Map<number, EmployeeMonthlyAvailability> = new Map();


  ViewMode = ViewMode;
  BudgetCategory = BudgetCategory;
  ResourceAssignmentMode = ResourceAssignmentMode;
  Math = Math;

  editingPlanId: number | null = null;

  currentResourceMode: ResourceAssignmentMode = ResourceAssignmentMode.QUANTITY;

  employeeCategories: string[] = [];
  equipmentCategories: string[] = [];

  employeeQuantities: ResourceQuantity[] = [];
  equipmentQuantities: ResourceQuantity[] = [];
  vehicleQuantity: number = 0;

  projectChCode: string = '';

  currentView: ViewMode = ViewMode.CONTRACT;
  currentOdsIndex: number = -1;
  currentPlanIndex: number = -1;

  draftId: number | null = null;
  isDraft: boolean = true;
  lastSaved: Date | null = null;
  autoSaving: boolean = false;

  contractForm!: FormGroup;
  odsForm!: FormGroup;
  planForm!: FormGroup;
  coordinatorForm!: FormGroup;
  budgetItemForm!: FormGroup;

  serviceOrders: any[] = [];
  assignedCoordinators: any[] = [];

  clients: Client[] = [];
  employees: Employee[] = [];
  equipment: Equipment[] = [];
  vehicles: Vehicle[] = [];
  matrices: Matrix[] = [];
  coordinators: Coordinator[] = [];
  reusableOdsList: ReusableOdsSummary[] = [];

  loading: boolean = false;
  dataReady: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  showFinalDashboard: boolean = false;
  projectResult: number | null = null;

  odsCreationMode: 'new' | 'reuse' = 'new';
  selectedReusableOdsCode: string | null = null;
  loadingReusableOds: boolean = false;

  showBudgetItemModal: boolean = false;
  editingBudgetItemIndex: number = -1;

  availableEmployees: any[] = [];
  availableEquipment: any[] = [];
  availableVehicles: any[] = [];
  
  contracts: any[] = [];
  
  resourceDatesSet: boolean = false;

  employeeSearchTerm: string = '';
  equipmentSearchTerm: string = '';
  vehicleSearchTerm: string = '';

  employeeCategoryFilter: string = '';
  equipmentCategoryFilter: string = '';
  vehicleLocationFilter: string = '';
  
  odsSameDatesAsContract: boolean = false;
  
  selectedContract: any = '';
  
  contratoModoLectura: boolean = false;


  projectResourceMode: number = 0;

  planRequiredResources: {

    employeeQuantities: { categoryName: string; quantity: number }[];
    equipmentQuantities: { categoryName: string; quantity: number }[];
    vehicleQuantity: number;

  } | null = null;

  private destroy$ = new Subject<void>();
  private autoSaveSubscription?: Subscription;
  private formChanges$ = new Subject<void>();

  ngOnInit(): void {
    
    this.initializeForms();
    
    this.loadCatalogs();
    
    this.setupAutoSave();
    
    
    this.checkForDraftToLoad();
    
    this.route.queryParams.subscribe(params => {
      
      const mode = params['mode'];
      
      const projectId = params['projectId'];
      
      const planId = params['planId'];
      
      const odsIndex = params['odsIndex'];

      if (mode === 'edit-resources' && projectId && planId && odsIndex !== undefined) {
        
        this.loadProjectForResourceEdit(+projectId, +planId, +odsIndex);
        
      } else if (mode === 'add-ods') {
        
        this.checkForDraftToLoad();
        
      }
        
      else {
        
        this.checkForDraftToLoad();
        
      }
      
    });
    

  }

  get filteredEmployees() {
    return this.availableEmployees.filter(emp => {
      let matches = true;

      // Filtro por búsqueda (nombre, cédula)
      if (this.employeeSearchTerm) {
        const term = this.employeeSearchTerm.toLowerCase();
        matches = matches && (
          emp.name?.toLowerCase().includes(term) ||
          emp.idCard?.toLowerCase().includes(term) ||
          emp.position?.toLowerCase().includes(term)
        );
      }

      // Filtro por categoría (posición)
      if (this.employeeCategoryFilter) {
        matches = matches && emp.position === this.employeeCategoryFilter;
      }

      return matches;
    });
  }




  get filteredEquipment() {
    return this.availableEquipment.filter(eq => {
      let matches = true;

      if (this.equipmentSearchTerm) {
        const term = this.equipmentSearchTerm.toLowerCase();
        matches = matches && (
          eq.name?.toLowerCase().includes(term) ||
          eq.code?.toLowerCase().includes(term) ||
          eq.serialNumber?.toLowerCase().includes(term)
        );
      }

      if (this.equipmentCategoryFilter) {
        matches = matches && eq.name === this.equipmentCategoryFilter;
      }

      return matches;
    });
  }

  onOdsSameDatesChange(): void {
    if (this.odsSameDatesAsContract) {
      this.odsForm.patchValue({
        startDate: this.contractForm.value.startDate || '',
        endDate: this.contractForm.value.endDate || ''
      });
    } else {
      this.odsForm.patchValue({
        startDate: '',
        endDate: ''
      });
    }
  }

  get filteredVehicles() {
    return this.availableVehicles.filter(v => {
      let matches = true;

      if (this.vehicleSearchTerm) {
        const term = this.vehicleSearchTerm.toLowerCase();
        matches = matches && (
          v.plateNumber?.toLowerCase().includes(term) ||
          v.brand?.toLowerCase().includes(term) ||
          v.model?.toLowerCase().includes(term)
        );
      }

      if (this.vehicleLocationFilter) {
        matches = matches && v.location === this.vehicleLocationFilter;
      }

      return matches;
    });
  }

  get uniqueEmployeeCategories(): string[] {
    return [...new Set(this.employees.map(e => e.position).filter(Boolean))];
  }

  get uniqueEquipmentCategories(): string[] {
    return [...new Set(this.equipment.map(e => e.name).filter(Boolean))];
  }

  get uniqueVehicleLocations(): string[] {
    return [...new Set(this.vehicles.map(v => v.location).filter(Boolean))];
  }




  private loadProjectForResourceEdit(projectId: number, planId: number, odsIndex: number): void {

    this.loading = true;

    this.projectService.getProjectById(projectId).subscribe({

      next: (project) => {

        this.contractForm.patchValue({
          contractCode: project.contract?.contractCode,
          contractName: project.contract?.contractName,
          clientId: project.clientId,
          startDate: project.initialDate,
          endDate: project.finalDate
        });



        this.serviceOrders = project.serviceOrders.map((ods: any) => ({
          odsCode: ods.odsCode,
          odsName: ods.odsName,
          odsValue: 0,

          startDate: ods.startDate,
          endDate: ods.endDate,
          samplingPlans: ods.samplingPlans || []

        }));


        this.projectResourceMode = project.projectResourceAssignementMode;

        this.currentOdsIndex = odsIndex;

        // Buscar el plan específico
        const plan = this.serviceOrders[odsIndex]?.samplingPlans.find((p: any) => p.id === planId);

        if (plan) {
          this.loadPlanForEditing(plan);
          this.currentView = ViewMode.PLAN_FORM;
        }

        this.isDraft = false;
        this.loading = false;

        this.successMessage = 'Proyecto cargado. Complete la asignación de recursos.';


        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (error) => {
        console.error('Error cargando proyecto:', error);
        this.errorMessage = 'Error al cargar el proyecto';
        this.loading = false;
      }
    });
  }


  private loadPlanForEditing(plan: any): void {
    this.currentResourceMode = ResourceAssignmentMode.DETAILED;



    if (plan.employeeQuantities?.length > 0 ||
      plan.equipmentQuantities?.length > 0 ||
      plan.vehicleQuantity > 0) {

      this.planRequiredResources = {
        employeeQuantities: plan.employeeQuantities || [],
        equipmentQuantities: plan.equipmentQuantities || [],
        vehicleQuantity: plan.vehicleQuantity || 0
      };

      console.log(' RECURSOS REQUERIDOS CARGADOS:', this.planRequiredResources);
    } else {
      this.planRequiredResources = null;
    }

    this.planForm.patchValue({
      planCode: plan.planCode,
      planName: plan.planName,
      startDate: plan.startDate,
      endDate: plan.endDate,
      selectedMatrixIds: plan.sites?.map((s: any) => s.matrixId) || [],
      hasReport: plan.sites?.[0]?.hasReport || false,
      hasGDB: plan.sites?.[0]?.hasGDB || false,
      coordinatorId: plan.projectCoordinatorId || plan.coordinatorId,
      totalSites: plan.sites?.length || 1,
      resourceStartDate: plan.resourceStartDate,
      resourceEndDate: plan.resourceEndDate,
      resourceAssignmentMode: ResourceAssignmentMode.DETAILED,
      budgetItems: plan.budget?.items || []
    });

    this.sitesArray.clear();
    if (plan.sites && plan.sites.length > 0) {
      plan.sites.forEach((site: any) => {
        const siteGroup = this.fb.group({
          name: [site.name],
          matrixId: [site.matrixId],
          isSubcontracted: [false],
          subcontractorName: [''],
          executionDate: [site.executionDate],
          hasReport: [site.hasReport],
          hasGDB: [site.hasGDB]
        });
        this.sitesArray.push(siteGroup);
      });
    }

    if (plan.resources) {
      this.planForm.patchValue({
        selectedEmployeeIds: plan.resources.employeeIds || [],
        selectedEquipmentIds: plan.resources.equipmentIds || [],
        selectedVehicleIds: plan.resources.vehicleIds || []
      });
    }

    if (plan.resourceStartDate && plan.resourceEndDate) {
      this.loadAvailableResources();
    }

    this.editingPlanId = plan.id;
  }


  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.autoSaveSubscription) {
      this.autoSaveSubscription.unsubscribe();
    }
  }

  initializeForms(): void {
    this.contractForm = this.fb.group({
      contractCode: ['', Validators.required],
      contractName: [''],
      clientId: ['', Validators.required],
      startDate: [''],
      endDate: ['']
    });

    this.odsForm = this.fb.group({
      odsCode: ['', Validators.required],
      odsName: [''],
      odsValue: [0, [Validators.required, Validators.min(0)]],
      startDate: [''],
      endDate: ['']
    });

    this.planForm = this.fb.group({
      planCode: ['', Validators.required],
      planName: ['', Validators.required],
      startDate: [''],
      endDate: [''],
      totalSites: [1, [Validators.required, Validators.min(1)]],
      selectedMatrixIds: [[], Validators.required],
      matrixId: [''],
      hasReport: [false],
      hasGDB: [false],
      coordinatorId: ['', Validators.required],
      sites: this.fb.array([]),
      resourceAssignmentMode: [ResourceAssignmentMode.QUANTITY],
      employeeQuantities: [[]],
      equipmentQuantities: [[]],
      vehicleQuantity: [0],
      resourceStartDate: [''],
      resourceEndDate: [''],
      selectedEmployeeIds: [[]],
      selectedEquipmentIds: [[]],
      selectedVehicleIds: [[]],
      budgetItems: [[]],
      notes: ['']
    });


    this.budgetItemForm = this.fb.group({
      category: [BudgetCategory.TRANSPORT, Validators.required],
      concept: ['', Validators.required],
      provider: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['días', Validators.required],
      costPerUnit: [0, [Validators.required, Validators.min(0)]],
      billedPerUnit: [0, [Validators.required, Validators.min(0)]],
      notes: ['']
    });

    this.addSite();

    this.contractForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.formChanges$.next());

    this.planForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.formChanges$.next());

    this.planForm.get('resourceStartDate')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAvailableResources();
        this.updateVehicleBudgetDays();
      });

    this.planForm.get('resourceEndDate')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadAvailableResources();
        this.updateVehicleBudgetDays();
      });
  }

  toggleMatrixSelection(matrixId: number): void {
    const current = this.planForm.value.selectedMatrixIds || [];
    const index = current.indexOf(matrixId)
    if (index === -1) {
      this.planForm.patchValue({
        selectedMatrixIds: [...current, matrixId]
      });
    } else {
      current.splice(index, 1);
      this.planForm.patchValue({
        selectedMatrixIds: [...current]
      });
    }
    this.formChanges$.next();
  }

  isMatrixSelected(matrixId: number): boolean {
    return (this.planForm.value.selectedMatrixIds || []).includes(matrixId);
  }

  setOdsCreationMode(mode: 'new' | 'reuse'): void {
    this.odsCreationMode = mode;
    this.selectedReusableOdsCode = null;
    if (mode === 'new') {
      this.odsForm.reset();
    }
  }

  addServiceOrderFromReusable(): void {
    if (!this.odsForm.valid || !this.selectedReusableOdsCode) {
      this.errorMessage = 'Complete el código de la ODS y seleccione una configuración';
      return;
    }

    this.loadingReusableOds = true;

    this.odsService.getReusableOds(this.selectedReusableOdsCode).subscribe({
      next: (reusableOds: ReusableOds) => {
        const ods = {
          odsCode: this.odsForm.value.odsCode,
          odsName: this.odsForm.value.odsName || reusableOds.odsName || this.odsForm.value.odsCode,
          odsValue: this.odsForm.value.odsValue || 0,
          startDate: this.odsForm.value.startDate,
          endDate: this.odsForm.value.endDate,
          samplingPlans: this.mapReusablePlansToCurrentProject(reusableOds.samplingPlans || [])
        };

        this.serviceOrders.push(ods);
        this.odsForm.reset();
        this.selectedReusableOdsCode = null;
        this.odsCreationMode = 'new';
        this.errorMessage = '';
        this.successMessage = `ODS "${ods.odsCode}" agregada con ${ods.samplingPlans.length} planes precargados`;
        setTimeout(() => this.successMessage = '', 5000);
        this.formChanges$.next();
        this.loadingReusableOds = false;
      },
      error: (error) => {
        this.errorMessage = 'Error al cargar la configuración de ODS reutilizable';
        this.loadingReusableOds = false;
      }
    });
  }


  private mapReusablePlansToCurrentProject(reusablePlans: any[]): any[] {
    return reusablePlans.map(plan => ({
      planCode: plan.planCode || '',
      planName: plan.planName || '',
      startDate: null,
      endDate: null,
      matrixIds: [...new Set((plan.sites || []).map((s: any) => s.matrixId).filter(Boolean))],
      matrixNames: [...new Set((plan.sites || []).map((s: any) => s.matrixName).filter(Boolean))].join(', '),
      coordinatorId: null,
      hasReport: plan.sites?.[0]?.hasReport || false,
      hasGDB: plan.sites?.[0]?.hasGDB || false,
      // ✅ Sitios con toda la info del back
      sites: (plan.sites || []).map((site: any) => ({
        name: site.name || '',
        matrixId: site.matrixId || null,
        matrixName: site.matrixName || '',
        isSubcontracted: false,
        subcontractorName: null,
        executionDate: null,
        hasReport: site.hasReport || false,
        hasGDB: site.hasGDB || false
      })),
      resources: {
        startDate: null,
        endDate: null,
        employeeIds: [],
        equipmentIds: [],
        vehicleIds: [],
        employees: [],
        equipment: [],
        vehicles: []
      },
      budget: {
        chCode: '',
        items: [],
        summary: null,
        notes: ''
      }
    }));
  }

  getReusableOdsName(code: string): string {

    const ods = this.reusableOdsList.find(o => o.odsCode === code);

    return ods?.odsName || 'ODS';

  }

  updateVehicleBudgetDays(): void {

    const startDate = this.planForm.value.resourceStartDate;

    const endDate = this.planForm.value.resourceEndDate;

    if (!startDate || !endDate) return;

    const days = this.calculateDaysBetweenDates(startDate, endDate);

    const currentItems = [...this.budgetItems];

    currentItems.forEach(item => {

      if (item.id.startsWith('vehicle-')) {

        item.quantity = days;

      }

    });

    this.planForm.patchValue({ budgetItems: currentItems });
  }

  loadAvailableResources(): void {

    const startDate = this.planForm.value.resourceStartDate;

    const endDate = this.planForm.value.resourceEndDate;


    if (!startDate || !endDate) {

      this.resourceDatesSet = false;

      return;

    }

    this.resourceDatesSet = true;

    this.loading = true;

    this.resourcesLoadedCount = 0;

    const now = new Date();

    const year = now.getFullYear();

    const month = now.getMonth() + 1;

    this.employeeService.getMonthlyAvailability(year, month).subscribe({

      next: (availability) => {

        this.employeeMonthlyAvailability = new Map(

          availability.map(a => [a.employeeId, a])

        );

      },

      error: () => {

        this.employeeMonthlyAvailability = new Map();

      }

    });



    this.employeeService.getAvailableEmployees(startDate, endDate).subscribe({

      next: (employees) => {

        this.availableEmployees = this.employees.map(emp => {

          const availableEmp = employees?.find(e => e.id === emp.id);

          return {

            ...emp,

            isAvailable: availableEmp ? availableEmp.isAvailable : false

          };

        });

        this.checkAllResourcesLoaded();
      },
      error: (error) => {
        console.error('ERROR loading employees:', error);
        this.availableEmployees = this.employees.map(e => ({ ...e, isAvailable: false }));
        this.checkAllResourcesLoaded();
      }
    });

    this.equipmentService.getAvailableEquipment(startDate, endDate).subscribe({
      next: (equipment) => {
        this.availableEquipment = this.equipment.map(eq => {
          const availableEq = equipment?.find(e => e.id === eq.id);
          return {
            ...eq,
            isAvailable: availableEq ? availableEq.isAvailable : false
          };
        });
        this.checkAllResourcesLoaded();
      },
      error: (error) => {
        console.error('ERROR loading equipment:', error);
        this.availableEquipment = this.equipment.map(e => ({ ...e, isAvailable: false }));
        this.checkAllResourcesLoaded();
      }
    });

    this.vehicleService.getAvailableVehicles(startDate, endDate).subscribe({
      next: (vehicles) => {
        this.availableVehicles = this.vehicles.map(veh => {
          const availableVeh = vehicles?.find(v => v.id === veh.id);
          return {
            ...veh,
            isAvailable: availableVeh ? availableVeh.isAvailable : false
          };
        });
        this.checkAllResourcesLoaded();
      },
      error: (error) => {
        console.error('ERROR loading vehicles:', error);
        this.availableVehicles = this.vehicles.map(v => ({ ...v, isAvailable: false }));
        this.checkAllResourcesLoaded();
      }
    });
  }

  private resourcesLoadedCount = 0;

  getEmployeeRemainingDays(employeeId: number): number {
    const availability = this.employeeMonthlyAvailability.get(employeeId);
    if (!availability) return 20; // si no hay log, asumimos disponible
    return Math.max(0, availability.remainingDays);
  }

  getEmployeeWorkedDays(employeeId: number): number {
    return this.employeeMonthlyAvailability.get(employeeId)?.workedDays ?? 0;
  }

  getEmployeeWorkDaysPerMonth(employeeId: number): number {
    return this.employeeMonthlyAvailability.get(employeeId)?.workDaysPerMonth ?? 20;
  }

  isEmployeeMonthFull(employeeId: number): boolean {
    return this.getEmployeeRemainingDays(employeeId) <= 0;
  }

  getProjectDurationDays(): number {
    const start = this.planForm.value.resourceStartDate;
    const end = this.planForm.value.resourceEndDate;
    if (!start || !end) return 0;
    return this.calculateDaysBetweenDates(start, end);
  }

  getEmployeeAvailabilityAlert(employeeId: number): string | null {
    const remaining = this.getEmployeeRemainingDays(employeeId);
    const projectDays = this.getProjectDurationDays();

    if (remaining <= 0) return 'Mes completo';
    if (projectDays > 0 && remaining < projectDays) {
      return `Solo puede ${remaining}d, reemplazar en ${remaining}d`;
    }
    return null;
  }

  getRemainingDaysColor(employeeId: number): string {
    const remaining = this.getEmployeeRemainingDays(employeeId);
    if (remaining <= 0) return 'text-red-600';
    if (remaining <= 5) return 'text-amber-600';
    return 'text-emerald-600';
  }
  
  
  onContractSelected(contractId: any): void {
    
    
    const contract = this.contracts.find(c => c.id === +contractId);
    
    
    
    if (!contract) return;
    
    const client = this.clients.find(c => c.name === contract.clientName);
    
      this.contractForm.patchValue({
      contractCode: contract.contractCode || contract.projectName,
      contractName: contract.contractName || contract.projectName,
      clientId: client?.id || '',
      startDate: contract.initialDate || '',
      endDate: contract.finalDate || ''
    });
    
  }


  private checkAllResourcesLoaded(): void {
    this.resourcesLoadedCount++;
    if (this.resourcesLoadedCount >= 3) {
      this.loading = false;
      this.resourcesLoadedCount = 0;
    }
  }

  calculateDaysBetweenDates(startDate: string, endDate: string): number {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  toggleVehicleSelection(vehicleId: number): void {
    const current = this.planForm.value.selectedVehicleIds || [];
    const index = current.indexOf(vehicleId);

    if (index === -1) {
      this.planForm.patchValue({
        selectedVehicleIds: [...current, vehicleId]
      });
      this.addVehicleToBudget(vehicleId);
    } else {
      current.splice(index, 1);
      this.planForm.patchValue({
        selectedVehicleIds: [...current]
      });
      this.removeVehicleFromBudget(vehicleId);
    }
    this.formChanges$.next();
  }

  addVehicleToBudget(vehicleId: number): void {
    const vehicle = this.availableVehicles.find(v => v.id === vehicleId);
    const startDate = this.planForm.value.resourceStartDate;
    const endDate = this.planForm.value.resourceEndDate;

    if (!vehicle || !startDate || !endDate || !vehicle.costPerDay) {
      return;
    }

    const days = this.calculateDaysBetweenDates(startDate, endDate);
    const costPerDay = vehicle.costPerDay;

    const vehicleBudgetItem: BudgetItem = {
      id: `vehicle-${vehicleId}`,
      category: BudgetCategory.TRANSPORT,
      concept: `Vehículo ${vehicle.plateNumber} - ${vehicle.brand} ${vehicle.model}`,
      provider: vehicle.plateNumber,
      quantity: days,
      unit: 'días',
      costPerUnit: costPerDay,
      billedPerUnit: costPerDay,
      notes: 'Agregado automáticamente'
    };

    const currentItems = [...this.budgetItems];
    const existingIndex = currentItems.findIndex(item => item.id === `vehicle-${vehicleId}`);

    if (existingIndex === -1) {
      currentItems.push(vehicleBudgetItem);
      this.planForm.patchValue({ budgetItems: currentItems });
    }
  }

  removeVehicleFromBudget(vehicleId: number): void {
    const currentItems = [...this.budgetItems];
    const filteredItems = currentItems.filter(item => item.id !== `vehicle-${vehicleId}`);
    this.planForm.patchValue({ budgetItems: filteredItems });
  }

  loadCatalogs(): void {
    this.loading = true;

    Promise.all([
      this.contractService.getContracts().toPromise(),
      this.clientService.getAllClients().toPromise(),
      this.employeeService.getAllEmployees().toPromise(),
      this.equipmentService.getAllEquipment().toPromise(),
      this.vehicleService.getAllVehicles().toPromise(),
      this.matrixService.getAllMatrix().toPromise(),
      this.coordinatorService.getAllCoordinators().toPromise(),
      this.odsService.getReusableOdsList().toPromise()
      
    ]).then(([contracts,clients, employees, equipment, vehicles, matrices, coordinators, reusableOds]) => {
      
      this.contracts = contracts || [];
      this.clients = clients || [];
      this.employees = employees || [];
      this.equipment = equipment || [];
      this.vehicles = vehicles || [];
      this.matrices = matrices || [];
      this.coordinators = coordinators || [];
      this.reusableOdsList = reusableOds || [];

      this.employeeCategories = [...new Set(this.employees
        .map(e => e.position)
        .filter(c => c && c.trim() !== '')
      )];

      this.equipmentCategories = [...new Set(this.equipment
        .map(e => e.name)
        .filter(c => c && c.trim() !== '')
      )];

      this.dataReady = true;
      this.loading = false;
    }).catch(error => {
      console.error('Error cargando catálogos:', error);
      this.errorMessage = 'Error al cargar los datos necesarios'
      this.loading = false;
    });
  }

  setupAutoSave(): void {
    this.formChanges$
      .pipe(
        debounceTime(30000),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (this.isDraft && this.contractForm.valid) {
        }
      });
  }

  checkForDraftToLoad(): void {
    this.route.queryParams.subscribe(params => {
      const draftId = params['draftId'];
      if (draftId) {
        this.loadDraft(Number(draftId));
      }
    });
  }

  generateMultipleSites(): void {

    const count = this.planForm.value.totalSites || 1;

    const planCode = this.planForm.value.planCode;

    const planName = this.planForm.value.planName;

    const baseName = this.planForm.value.planName || this.planForm.value.planCode;

    const executionDate = this.planForm.value.startDate || '';
    
    const startDate = this.planForm.value.startDate;
  
    const endDate   = this.planForm.value.endDate;

    if (!planCode || !planName) {

      this.errorMessage = 'Complete el codigo y nombre del plan antes de generar sitios';

      return;

    }
    
    
    const executionDates = this.distributeDatesAcrossSites(startDate, endDate, count);


    this.sitesArray.clear();

    for (let i = 0; i < count; i++) {
      const siteName  = `Sitio #${i + 1} ${planName}-${planCode}`;
      const siteGroup = this.fb.group({
        name:              [siteName],
        matrixId:          [''],
        isSubcontracted:   [false],
        subcontractorName: [''],
        executionDate:     [executionDates[i]],
        hasReport:         [false],
        hasGDB:            [false]
    });

      siteGroup.get('isSubcontracted')?.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe(isSubcontracted => {
          const subcontractorControl = siteGroup.get('subcontractorName');
          if (isSubcontracted) {
            subcontractorControl?.setValidators([Validators.required]);
          } else {
            subcontractorControl?.clearValidators();
          }
          subcontractorControl?.updateValueAndValidity();
        });

      this.sitesArray.push(siteGroup);
    }
    this.formChanges$.next();
  }
  
  
  
  private distributeDatesAcrossSites(
    startDateStr: string,
    endDateStr: string,
    siteCount: number
  ): string[] {

    if (!startDateStr || !endDateStr || siteCount <= 0) {
      return Array(siteCount).fill('');
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    const totalDays =
      Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const sitesPerDay = Math.floor(siteCount / totalDays);
    const remainder = siteCount % totalDays;

    const dates: string[] = [];

    for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {

      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + dayIndex);

      const countForThisDay =
        sitesPerDay + (dayIndex < remainder ? 1 : 0);

      for (let i = 0; i < countForThisDay; i++) {
        dates.push(currentDate.toISOString().split('T')[0]);
      }
    }

    return dates;
  }

  get sitesArray(): FormArray {
    return this.planForm.get('sites') as FormArray;
  }

  addSite(): void {
    const planCode = this.planForm.value.planCode;
    const planName = this.planForm.value.planName;
    const siteName = planCode && planName ? `${planCode}-${planName}` : '';
    const executionDate = this.planForm.value.startDate || '';

    const siteGroup = this.fb.group({
      name: [siteName],
      matrixId: [''],
      isSubcontracted: [false],
      subcontractorName: [''],
      executionDate: [executionDate],
      hasReport: [false],
      hasGDB: [false]
    });

    siteGroup.get('isSubcontracted')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(isSubcontracted => {
        const subcontractorControl = siteGroup.get('subcontractorName');
        if (isSubcontracted) {
          subcontractorControl?.setValidators([Validators.required]);
        } else {
          subcontractorControl?.clearValidators();
        }
        subcontractorControl?.updateValueAndValidity();
      });

    this.sitesArray.push(siteGroup);
    this.formChanges$.next();
  }

  removeSite(index: number): void {
    if (this.sitesArray.length > 1) {
      this.sitesArray.removeAt(index);
      this.formChanges$.next();
    }
  }

  toggleEmployeeSelection(employeeId: number): void {
    const current = this.planForm.value.selectedEmployeeIds || [];
    const index = current.indexOf(employeeId);

    if (index === -1) {
      this.planForm.patchValue({
        selectedEmployeeIds: [...current, employeeId]
      });
    } else {
      current.splice(index, 1);
      this.planForm.patchValue({
        selectedEmployeeIds: [...current]
      });
    }
    this.formChanges$.next();
  }

  isEmployeeSelected(employeeId: number): boolean {
    return (this.planForm.value.selectedEmployeeIds || []).includes(employeeId);
  }

  toggleEquipmentSelection(equipmentId: number): void {
    const current = this.planForm.value.selectedEquipmentIds || [];
    const index = current.indexOf(equipmentId);

    if (index === -1) {
      this.planForm.patchValue({
        selectedEquipmentIds: [...current, equipmentId]
      });
    } else {
      current.splice(index, 1);
      this.planForm.patchValue({
        selectedEquipmentIds: [...current]
      });
    }
    this.formChanges$.next();
  }

  isEquipmentSelected(equipmentId: number): boolean {
    return (this.planForm.value.selectedEquipmentIds || []).includes(equipmentId);
  }

  isVehicleSelected(vehicleId: number): boolean {
    return (this.planForm.value.selectedVehicleIds || []).includes(vehicleId);
  }

  get budgetItems(): BudgetItem[] {
    return this.planForm.value.budgetItems || [];
  }

  openBudgetItemModal(): void {
    this.budgetItemForm.reset({
      category: BudgetCategory.TRANSPORT,
      quantity: 1,
      unit: 'días',
      costPerUnit: 0,
      billedPerUnit: 0
    });
    this.editingBudgetItemIndex = -1;
    this.showBudgetItemModal = true;
  }

  editBudgetItem(index: number): void {
    const item = this.budgetItems[index];
    this.budgetItemForm.patchValue(item);
    this.editingBudgetItemIndex = index;
    this.showBudgetItemModal = true;
  }

  saveBudgetItem(): void {
    if (!this.budgetItemForm.valid) {
      this.errorMessage = 'Complete todos los campos requeridos del ítem de presupuesto';
      return;
    }

    const formValue = this.budgetItemForm.value;
    const budgetItem: BudgetItem = {
      id: this.editingBudgetItemIndex === -1 ? this.generateId() : this.budgetItems[this.editingBudgetItemIndex].id,
      ...formValue
    };

    const currentItems = [...this.budgetItems];

    if (this.editingBudgetItemIndex === -1) {
      currentItems.push(budgetItem);
    } else {
      currentItems[this.editingBudgetItemIndex] = budgetItem;
    }

    this.planForm.patchValue({ budgetItems: currentItems });
    this.closeBudgetItemModal();
    this.formChanges$.next();
  }

  removeBudgetItem(index: number): void {
    const currentItems = [...this.budgetItems];
    currentItems.splice(index, 1);
    this.planForm.patchValue({ budgetItems: currentItems });
    this.formChanges$.next();
  }

  closeBudgetItemModal(): void {
    this.showBudgetItemModal = false;
    this.editingBudgetItemIndex = -1;
    this.budgetItemForm.reset();
  }

  calculateItemTotal(item: BudgetItem): { cost: number; billed: number; profit: number; margin: number } {
    const cost = item.quantity * item.costPerUnit;
    const billed = item.quantity * item.billedPerUnit;
    const profit = billed - cost;
    const margin = billed > 0 ? (profit / billed) * 100 : 0;

    return { cost, billed, profit, margin };
  }

  get planBudgetSummary() {
    const summary = {
      byCategory: new Map<BudgetCategory, any>(),
      grandTotal: { cost: 0, billed: 0, profit: 0, margin: 0 }
    };

    this.budgetItems.forEach(item => {
      const totals = this.calculateItemTotal(item);

      if (!summary.byCategory.has(item.category)) {
        summary.byCategory.set(item.category, {
          cost: 0,
          billed: 0,
          profit: 0,
          items: []
        });
      }

      const catSummary = summary.byCategory.get(item.category)!;
      catSummary.cost += totals.cost;
      catSummary.billed += totals.billed;
      catSummary.profit += totals.profit;
      catSummary.items.push(item);

      summary.grandTotal.cost += totals.cost;
      summary.grandTotal.billed += totals.billed;
      summary.grandTotal.profit += totals.profit;
    });

    if (summary.grandTotal.billed > 0) {
      summary.grandTotal.margin = (summary.grandTotal.profit / summary.grandTotal.billed) * 100;
    }

    return summary;
  }

  getOdsBudgetIncludingCurrent(odsIndex: number): { used: number; available: number; percentage: number } {
    const ods = this.serviceOrders[odsIndex];
    if (!ods) return { used: 0, available: 0, percentage: 0 };

    const odsValue = ods.odsValue || 0;
    let totalUsed = 0;

    if (ods.samplingPlans && ods.samplingPlans.length > 0) {
      ods.samplingPlans.forEach((plan: any) => {
        if (plan.budget && plan.budget.items) {
          plan.budget.items.forEach((item: BudgetItem) => {
            totalUsed += item.quantity * item.billedPerUnit;
          });
        }
      });
    }

    if (!this.editingPlanId &&
      this.currentView === ViewMode.PLAN_FORM &&
      this.currentOdsIndex === odsIndex) {
      const currentPlanBudget = this.getCurrentBudgetBilledTotal();
      totalUsed += currentPlanBudget;
    }

    const available = odsValue - totalUsed;
    const percentage = odsValue > 0 ? (totalUsed / odsValue) * 100 : 0;

    return { used: totalUsed, available, percentage };
  }

  getOdsBudgetSummary(odsIndex: number): { used: number; available: number; percentage: number } {
    const ods = this.serviceOrders[odsIndex];
    if (!ods) return { used: 0, available: 0, percentage: 0 };

    const odsValue = ods.odsValue || 0;
    let totalUsed = 0;

    if (ods.samplingPlans && ods.samplingPlans.length > 0) {
      ods.samplingPlans.forEach((plan: any) => {
        if (plan.budget && plan.budget.items) {
          plan.budget.items.forEach((item: BudgetItem) => {
            totalUsed += item.quantity * item.billedPerUnit;
          });
        }
      });
    }

    const available = odsValue - totalUsed;
    const percentage = odsValue > 0 ? (totalUsed / odsValue) * 100 : 0;

    return { used: totalUsed, available, percentage };
  }

  addServiceOrder(): void {
    if (!this.odsForm.valid) {
      this.errorMessage = 'Ingrese al menos el código de la ODS';
      return;
    }

    const ods = {
      odsCode: this.odsForm.value.odsCode,
      odsName: this.odsForm.value.odsName || this.odsForm.value.odsCode,
      odsValue: this.odsForm.value.odsValue || 0,
      startDate: this.odsForm.value.startDate,
      endDate: this.odsForm.value.endDate,
      samplingPlans: []
    };

    this.serviceOrders.push(ods);
    this.odsForm.reset();
    this.errorMessage = '';
    this.formChanges$.next();
  }

  removeServiceOrder(index: number): void {
    this.serviceOrders.splice(index, 1);
    this.formChanges$.next();
  }

  selectOdsForPlans(index: number): void {
    this.currentOdsIndex = index;
    this.currentView = ViewMode.PLAN_FORM;

    const ods = this.serviceOrders[index];
    this.planForm.patchValue({
      startDate: ods.startDate || '',
      endDate: ods.endDate || '',
      resourceStartDate: ods.startDate || '',
      resourceEndDate: ods.endDate || ''
    });

    if (ods.startDate && ods.endDate) {
      this.loadAvailableResources();
    }
  }

  backToOdsList(): void {
    this.currentView = ViewMode.ODS_LIST;
    this.currentOdsIndex = -1;
    this.expandedPlanIndex = -1;
    this.resetPlanForm();
  }

  addPlanToCurrentOds(): void {

    if (!this.planForm.valid) {
      this.errorMessage = 'Complete los campos requeridos del plan';
      return;
    }

    if (this.sitesArray.length === 0) {
      this.errorMessage = 'Agregue al menos un sitio de monitoreo';
      return;
    }

    if (!this.planForm.value.selectedMatrixIds || this.planForm.value.selectedMatrixIds.length === 0) {
      this.errorMessage = 'Seleccione al menos una matriz';
      return;
    }

    const mode = this.planForm.value.resourceAssignmentMode;

    if (mode === ResourceAssignmentMode.QUANTITY) {
      const hasEmployees = this.employeeQuantities.some(eq => eq.categoryName?.trim() && eq.quantity > 0);
      const hasEquipment = this.equipmentQuantities.some(eq => eq.categoryName?.trim() && eq.quantity > 0);
      const hasVehicles = this.vehicleQuantity > 0;

      if (!hasEmployees && !hasEquipment && !hasVehicles) {
        this.errorMessage = 'Agregue al menos un recurso (personal, equipo o vehículo)';
        return;
      }
    } else {
      if (!this.planForm.value.selectedEmployeeIds || this.planForm.value.selectedEmployeeIds.length === 0) {
        this.errorMessage = 'Seleccione al menos un empleado';
        return;
      }
    }

    if (this.budgetItems.length > 0) {
      const planBilledTotal = this.budgetItems.reduce((sum, item) => sum + (item.quantity * item.billedPerUnit), 0);
      const odsBudget = this.getOdsBudgetSummary(this.currentOdsIndex);

      if (planBilledTotal > odsBudget.available) {
        this.errorMessage = `El presupuesto del plan ($${planBilledTotal.toLocaleString()}) excede el disponible de la ODS ($${odsBudget.available.toLocaleString()})`;
        return;
      }
    }

    const selectedMatrices = this.matrices.filter(m =>
      this.planForm.value.selectedMatrixIds.includes(m.id)
    );

    if (this.editingPlanId) {
      this.updateExistingPlan();
      return;
    }

    const coordinator = this.coordinators.find(c => c.id === Number(this.planForm.value.coordinatorId));

    const sites = this.sitesArray.value.map((site: any) => ({
      name: site.name,
      matrixIds: this.planForm.value.selectedMatrixIds,
      matrixNames: selectedMatrices.map(m => m.matrixName).join(', '),
      isSubcontracted: site.isSubcontracted,
      subcontractorName: site.isSubcontracted ? (site.subcontractorName?.trim() || null) : null,
      executionDate: site.executionDate || null,
      hasReport: this.planForm.value.hasReport,
      hasGDB: this.planForm.value.hasGDB
    }));


    const validEmployeeQtys = this.employeeQuantities.filter(eq =>
      eq.categoryName?.trim() && eq.quantity > 0
    );

    const validEquipmentQtys = this.equipmentQuantities.filter(eq =>
      eq.categoryName?.trim() && eq.quantity > 0
    );

    const planData: any = {
      planCode: this.planForm.value.planCode,
      planName: this.planForm.value.planName,
      startDate: this.planForm.value.startDate,
      endDate: this.planForm.value.endDate,
      matrixIds: this.planForm.value.selectedMatrixIds,
      matrixNames: selectedMatrices.map(m => m.matrixName).join(', '),
      coordinatorId: Number(this.planForm.value.coordinatorId),
      coordinatorName: coordinator?.name || '',
      hasReport: this.planForm.value.hasReport,
      hasGDB: this.planForm.value.hasGDB,
      sites: sites,
      budget: {
        chCode: this.planForm.value.chCode || this.projectChCode,
        items: this.budgetItems,
        summary: this.planBudgetSummary,
        notes: this.planForm.value.notes
      }
    };

    if (mode === ResourceAssignmentMode.QUANTITY) {
      planData.resourceAssignmentMode = 'quantity';
      planData.employeeQuantities = validEmployeeQtys;
      planData.equipmentQuantities = validEquipmentQtys;
      planData.vehicleQuantity = this.vehicleQuantity || 0;
      planData.resourceStartDate = this.planForm.value.resourceStartDate;
      planData.resourceEndDate = this.planForm.value.resourceEndDate;
      planData.resources = null; // Importante: null para modo quantity
    } else {
      const selectedEmployees = this.employees.filter(e =>
        this.planForm.value.selectedEmployeeIds.includes(e.id)
      );
      const selectedEquipment = this.equipment.filter(e =>
        this.planForm.value.selectedEquipmentIds.includes(e.id)
      );
      const selectedVehicles = this.vehicles.filter(v =>
        this.planForm.value.selectedVehicleIds.includes(v.id)
      );

      planData.resourceAssignmentMode = 'detailed';
      planData.employeeQuantities = [];
      planData.equipmentQuantities = [];
      planData.vehicleQuantity = 0;
      planData.resourceStartDate = this.planForm.value.resourceStartDate;
      planData.resourceEndDate = this.planForm.value.resourceEndDate;

      planData.resources = {
        mode: 'DETAILED',
        startDate: this.planForm.value.resourceStartDate,
        endDate: this.planForm.value.resourceEndDate,
        employeeIds: this.planForm.value.selectedEmployeeIds || [],
        equipmentIds: this.planForm.value.selectedEquipmentIds || [],
        vehicleIds: this.planForm.value.selectedVehicleIds || [],
        employees: selectedEmployees,
        equipment: selectedEquipment,
        vehicles: selectedVehicles,
        employeeQuantities: [],
        equipmentQuantities: [],
        vehicleQuantity: 0
      };
    }

    this.serviceOrders[this.currentOdsIndex].samplingPlans.push(planData);

    console.log('PLAN GUARDADO CON CANTIDADES:', {
      mode: planData.resourceAssignmentMode,
      employeeQtys: planData.employeeQuantities,
      equipmentQtys: planData.equipmentQuantities,
      vehicleQty: planData.vehicleQuantity
    });

    this.resetPlanForm();
    this.errorMessage = '';
    this.successMessage = 'Plan agregado exitosamente';
    setTimeout(() => this.successMessage = '', 3000);
    this.formChanges$.next();
  }

  expandedPlanIndex: number = -1;

  togglePlanDetails(index: number): void {
    this.expandedPlanIndex = this.expandedPlanIndex === index ? -1 : index;
  }

  removePlanFromOds(odsIndex: number, planIndex: number): void {
    this.serviceOrders[odsIndex].samplingPlans.splice(planIndex, 1);
    this.formChanges$.next();
  }

  private updateExistingPlan(): void {

    const resourcesData = {

      mode: ResourceAssignmentMode.DETAILED,
      startDate: this.planForm.value.resourceStartDate,
      endDate: this.planForm.value.resourceEndDate,
      employeeIds: this.planForm.value.selectedEmployeeIds || [],
      equipmentIds: this.planForm.value.selectedEquipmentIds || [],
      vehicleIds: this.planForm.value.selectedVehicleIds || [],
      employeeQuantities: [],
      equipmentQuantities: [],
      vehicleQuantity: 0

    };

    this.loading = true;

    this.projectCreationService.updatePlanResources(this.editingPlanId!, resourcesData).subscribe({
      next: (response) => {

        if (this.serviceOrders[this.currentOdsIndex]?.samplingPlans) {

          const plan = this.serviceOrders[this.currentOdsIndex].samplingPlans
            .find((p: any) => p.id === this.editingPlanId);

          if (plan) {

            plan.resourceAssignmentMode = 'DETAILED';
            plan.resources = {
              mode: 'DETAILED',
              startDate: resourcesData.startDate,
              endDate: resourcesData.endDate,
              employeeIds: resourcesData.employeeIds,
              equipmentIds: resourcesData.equipmentIds,
              vehicleIds: resourcesData.vehicleIds,
              employees: this.employees.filter(e => resourcesData.employeeIds.includes(e.id)),
              equipment: this.equipment.filter(e => resourcesData.equipmentIds.includes(e.id)),
              vehicles: this.vehicles.filter(v => resourcesData.vehicleIds.includes(v.id))

            }

          }

        }

        this.successMessage = 'Recursos asignados exitosamente';
        this.loading = false;

        setTimeout(() => {

          this.router.navigate(['/projects-dashboard']);

        }, 2000);

      },
      error: (error) => {

        console.error('Error actualizando recursos:', error);

        this.errorMessage = 'Error al actualizar los recursos';

        this.loading = false;

      }

    });

  }

  resetPlanForm(): void {

    this.planRequiredResources = null;

    const odsStartDate = this.currentOdsIndex !== -1
      ? this.serviceOrders[this.currentOdsIndex].startDate
      : '';
    const odsEndDate = this.currentOdsIndex !== -1
      ? this.serviceOrders[this.currentOdsIndex].endDate
      : '';

    this.planForm.reset({
      startDate: odsStartDate,
      endDate: odsEndDate,
      resourceStartDate: odsStartDate,
      resourceEndDate: odsEndDate,
      resourceAssignmentMode: ResourceAssignmentMode.QUANTITY,
      employeeQuantities: [],
      equipmentQuantities: [],
      vehicleQuantity: 0,
      selectedEmployeeIds: [],
      selectedEquipmentIds: [],
      selectedVehicleIds: [],
      budgetItems: []
    });

    this.currentResourceMode = ResourceAssignmentMode.QUANTITY;
    this.employeeQuantities = [];
    this.equipmentQuantities = [];
    this.vehicleQuantity = 0;

    this.sitesArray.clear();
    this.addSite();
  }


  getPlanBudgetTotal(plan: any): number {
    if (!plan.budget || !plan.budget.items) return 0;
    return plan.budget.items.reduce((sum: number, item: BudgetItem) => sum + (item.quantity * item.billedPerUnit), 0);
  }


  getPlanBilledTotal(plan: any): number {
    if (!plan.budgetItems) return 0;
    return plan.budgetItems.reduce((sum: number, item: BudgetItem) =>
      sum + (item.quantity * item.billedPerUnit), 0
    );
  }

  getCurrentBudgetCostTotal(): number {
    return this.budgetItems.reduce((sum, item) =>
      sum + (item.quantity * item.costPerUnit), 0
    );
  }

  getCurrentBudgetBilledTotal(): number {
    return this.budgetItems.reduce((sum, item) =>
      sum + (item.quantity * item.billedPerUnit), 0
    );
  }

  getCurrentBudgetProfit(): number {
    return this.getCurrentBudgetBilledTotal() - this.getCurrentBudgetCostTotal();
  }

  addCoordinator(): void {
    if (!this.coordinatorForm.valid) {
      this.errorMessage = 'Seleccione un coordinador';
      return;
    }

    const coordinatorId = this.coordinatorForm.value.coordinatorId;
    const coordinator = this.coordinators.find(c => c.id === Number(coordinatorId));

    if (coordinator) {
      const alreadyAdded = this.assignedCoordinators.some(c => c.coordinatorId === Number(coordinatorId));
      if (alreadyAdded) {
        this.errorMessage = 'Este coordinador ya fue agregado';
        return;
      }

      this.assignedCoordinators.push({
        coordinatorId: Number(coordinatorId),
        coordinatorName: coordinator.name
      });
      this.coordinatorForm.reset();
      this.errorMessage = '';
      this.formChanges$.next();
    }
  }

  removeCoordinator(index: number): void {

    this.assignedCoordinators.splice(index, 1);

    this.formChanges$.next();

  }

  saveDraft(isAutoSave: boolean = false): void {
    if (!this.contractForm.valid) {
      if (!isAutoSave) {
        this.errorMessage = 'Complete al menos el código del contrato y el cliente';
      }
      return;
    }

    const draftData = {
      Id: this.draftId,
      Status: 'draft',
      Contract: {
        ContractCode: this.contractForm.value.contractCode,
        ContractName: this.contractForm.value.contractName || '',
        ClientId: Number(this.contractForm.value.clientId),
        ClientName: null,
        StartDate: this.contractForm.value.startDate || null,
        EndDate: this.contractForm.value.endDate || null
      },
      ServiceOrders: this.serviceOrders || [],
      Coordinators: this.assignedCoordinators || []
    };


    if (isAutoSave) {
      this.autoSaving = true;
    } else {
      this.loading = true;
    }

    this.draftService.saveDraft(draftData).subscribe({
      next: (result) => {
        console.log('RESPUESTA:', result);
        if (!this.draftId) {
          this.draftId = result.id || result.Id;
        }
        this.lastSaved = new Date();

        if (!isAutoSave) {
          this.successMessage = 'Borrador guardado exitosamente';
          setTimeout(() => this.successMessage = '', 3000);
        }

        this.loading = false;
        this.autoSaving = false;
      },
      error: (error) => {
        console.error('ERROR COMPLETO:', error);
        console.error('ERROR MESSAGE:', error.error);
        console.error('ERRORES DE VALIDACIÓN:', error.error?.errors);
        if (!isAutoSave) {
          this.errorMessage = 'Error al guardar el borrador';
        }
        this.loading = false;
        this.autoSaving = false;
      }
    });
  }

  loadDraft(draftId: number): void {
    this.loading = true;

    this.draftService.getDraftById(draftId).subscribe({
      next: (draft) => {
        this.draftId = draftId;
        this.restoreDraftData(draft);
        this.loading = false;
        this.successMessage = 'Borrador cargado exitosamente';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        console.error('Error cargando draft:', error);
        this.errorMessage = 'Error al cargar el borrador';
        this.loading = false;
      }
    });
  }

  deleteDraft(): void {
    if (!this.draftId) return;

    if (!confirm('¿Está seguro de eliminar este borrador?')) {
      return;
    }

    this.loading = true;

    this.draftService.deleteDraft(this.draftId).subscribe({
      next: () => {
        this.router.navigate(['/projects']);
      },
      error: (error) => {
        console.error('Error eliminando draft:', error);
        this.errorMessage = 'Error al eliminar el borrador';
        this.loading = false;
      }
    });
  }

  private restoreDraftData(draft: any): void {
    const contract = draft.contract || draft.Contract;
    const serviceOrders = draft.serviceOrders || draft.ServiceOrders;
    const coordinators = draft.coordinators || draft.Coordinators;

    if (contract) {
      this.contractForm.patchValue({
        contractCode: contract.contractCode || contract.ContractCode,
        contractName: contract.contractName || contract.ContractName,
        clientId: contract.clientId || contract.ClientId,
        startDate: contract.startDate || contract.StartDate,
        endDate: contract.endDate || contract.EndDate
      });
    }
    if (serviceOrders) {
      this.serviceOrders = serviceOrders;
    }
    if (coordinators) {
      this.assignedCoordinators = coordinators;
    }
  }

  canFinalize(): boolean {
    return this.contractForm.valid &&
      this.serviceOrders.length > 0 &&
      this.projectChCode.trim() !== '';
  }

  finalizeProject(): void {
    if (!this.canFinalize()) {
      this.errorMessage = 'Complete todos los datos requeridos antes de finalizar';
      return;
    }

    if (!confirm('¿Está seguro de crear el proyecto? Esto eliminará el borrador.')) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const projectDto = this.buildProjectDto();

    this.projectCreationService.createCompleteProject(projectDto).subscribe({
      next: (result) => {
        this.projectResult = result;
        if (this.draftId) {
          this.draftService.deleteDraft(this.draftId).subscribe();
        }
        this.loading = false;
        this.isDraft = false;
        this.showFinalDashboard = true;
      },
      error: (error) => {
        console.error('ERROR COMPLETO:', error);
        console.error('ERROR RESPONSE:', error.error);
        console.error('ERROR STATUS:', error.status);
        this.errorMessage = 'Error al crear el proyecto: ' + (error.error?.message || error.message);
        this.loading = false;
      }
    });
  }

  private calculatePlanBudgetTotals(budgetItems: BudgetItem[]) {
    const totals = {
      transportCostChemilab: 0,
      transportBilledToClient: 0,
      logisticsCostChemilab: 0,
      logisticsBilledToClient: 0,
      subcontractingCostChemilab: 0,
      subcontractingBilledToClient: 0,
      fluvialTransportCostChemilab: 0,
      fluvialTransportBilledToClient: 0,
      reportsCostChemilab: 0,
      reportsBilledToClient: 0,
      notes: this.planForm.value.notes || null
    };

    budgetItems.forEach(item => {
      const itemTotals = this.calculateItemTotal(item);
      switch (item.category) {
        case BudgetCategory.TRANSPORT:
          totals.transportCostChemilab += itemTotals.cost;
          totals.transportBilledToClient += itemTotals.billed;
          break;
        case BudgetCategory.LOGISTICS:
          totals.logisticsCostChemilab += itemTotals.cost;
          totals.logisticsBilledToClient += itemTotals.billed;
          break;
        case BudgetCategory.SUBCONTRACTING:
          totals.subcontractingCostChemilab += itemTotals.cost;
          totals.subcontractingBilledToClient += itemTotals.billed;
          break;
        case BudgetCategory.RIVER_TRANSPORT:
          totals.fluvialTransportCostChemilab += itemTotals.cost;
          totals.fluvialTransportBilledToClient += itemTotals.billed;
          break;
        case BudgetCategory.REPORTS:
          totals.reportsCostChemilab += itemTotals.cost;
          totals.reportsBilledToClient += itemTotals.billed;
          break;
      }
    });

    return totals;
  }

  private buildProjectDto(): CreateProject {
    const contractData = this.contractForm.value;

    const serviceOrders = this.serviceOrders.map(ods => ({
      odsCode: ods.odsCode,
      odsName: ods.odsName || ods.odsCode,
      startDate: ods.startDate || null,
      endDate: ods.endDate || null,
      samplingPlans: ods.samplingPlans.map((plan: any) => {

        return {
          planCode: plan.planCode,
          planName: plan.planName || plan.planCode,
          startDate: plan.startDate || null,
          endDate: plan.endDate || null,
          coordinatorId: plan.coordinatorId,
          sites: plan.sites.map((site: any) => ({
            name: site.name,
            matrixId: Array.isArray(site.matrixIds) ? site.matrixIds[0] : (site.matrixId || 0),
            executionDate: site.executionDate || null,
            hasReport: site.hasReport || false,
            hasGDB: site.hasGDB || false
          })),
          resources: {
            mode: plan.resourceAssignmentMode || 'QUANTITY',
            startDate: plan.resourceStartDate || null,
            endDate: plan.resourceEndDate || null,
            locationId: null,
            employeeIds: plan.resources?.employeeIds || [],
            equipmentIds: plan.resources?.equipmentIds || [],
            vehicleIds: plan.resources?.vehicleIds || [],
            employeeQuantities: plan.employeeQuantities || [],
            equipmentQuantities: plan.equipmentQuantities || [],
            vehicleQuantity: plan.vehicleQuantity || 0
          },
          budget: this.calculatePlanBudgetTotals(plan.budget?.items || [])
        };
      })
    }));

    return {
      contract: {
        contractCode: contractData.contractCode,
        contractName: contractData.contractName || '',
        clientId: Number(contractData.clientId),
        startDate: contractData.startDate || null,
        endDate: contractData.endDate || null
      },
      chCode: this.projectChCode,
      serviceOrders: serviceOrders,
      coordinatorIds: this.assignedCoordinators.map(c => c.coordinatorId),
      projectDetails: {
        projectName: contractData.contractName || contractData.contractCode,
        projectDescription: '',
        priority: 'media'
      },
      projectResourceAssignementMode: this.hasDetailedPlans() ? 1 : 0
    };
  }

  private hasDetailedPlans(): boolean {
    return this.serviceOrders.some(ods =>
      ods.samplingPlans.some((plan: any) =>
        plan.resourceAssignmentMode === 'DETAILED' ||
        plan.resourceAssignmentMode === ResourceAssignmentMode.DETAILED
      )
    );
  }


  createAnotherProject(): void {
    this.router.navigate(['/projects/new']);
    window.location.reload();
  }

  goToDashboard(): void {
    this.router.navigate(['/projects-dashboard']);
  }

  get getClientName(): string {
    const clientId = this.contractForm.value.clientId;
    const client = this.clients.find(c => c.id === Number(clientId));
    return client?.name || 'No asignado';
  }

  getTimeSinceLastSave(): string {
    if (!this.lastSaved) return 'Nunca';

    const seconds = Math.floor((new Date().getTime() - this.lastSaved.getTime()) / 1000);

    if (seconds < 60) return 'hace unos segundos';
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
    return `hace ${Math.floor(seconds / 3600)} horas`;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  get progressPercentage(): number {
    let completed = 0;
    let total = 5;

    if (this.contractForm.valid) completed++;
    if (this.serviceOrders.length > 0) completed++;
    if (this.serviceOrders.some(ods => ods.samplingPlans.length > 0)) completed++;
    if (this.assignedCoordinators.length > 0) completed++;
    if (this.canFinalize()) completed++;

    return Math.round((completed / total) * 100);
  }

  get budgetCategories() {
    return Object.values(BudgetCategory);
  }

  get hasAnyPlans(): boolean {
    return this.serviceOrders.some(ods => ods.samplingPlans.length > 0);
  }

  get totalPlansCount(): number {
    return this.serviceOrders.reduce((total, ods) => total + ods.samplingPlans.length, 0);
  }

  setResourceMode(mode: ResourceAssignmentMode): void {

    if (this.editingPlanId && mode === ResourceAssignmentMode.QUANTITY) {

      this.errorMessage = 'No se puede cambiar de modo detallado a cantidad una vez asignados los recursos específicos';

      setTimeout(() => this.errorMessage = '', 3000);

      return;

    }

    this.currentResourceMode = mode;

    this.planForm.patchValue({ resourceAssignmentMode: mode });

    if (mode === ResourceAssignmentMode.DETAILED) {

      this.loadRequiredResourcesFromQuantities();

      const startDate = this.planForm.value.resourceStartDate;

      const endDate = this.planForm.value.resourceEndDate;

      if (startDate && endDate) {

        this.loadAvailableResources();

      }

    }

    this.formChanges$.next();
  }

  addEmployeeQuantity(): void {
    this.employeeQuantities.push({ categoryName: '', quantity: 1 });
    this.updateEmployeeQuantitiesInForm();
  }

  removeEmployeeQuantity(index: number): void {
    this.employeeQuantities.splice(index, 1);
    this.updateEmployeeQuantitiesInForm();
  }

  updateEmployeeQuantitiesInForm(): void {
    this.planForm.patchValue({ employeeQuantities: [...this.employeeQuantities] });
    this.formChanges$.next();
  }

  addEquipmentQuantity(): void {
    this.equipmentQuantities.push({ categoryName: '', quantity: 1 });
    this.updateEquipmentQuantitiesInForm();
  }

  removeEquipmentQuantity(index: number): void {
    this.equipmentQuantities.splice(index, 1);
    this.updateEquipmentQuantitiesInForm();
  }

  updateEquipmentQuantitiesInForm(): void {
    this.planForm.patchValue({ equipmentQuantities: [...this.equipmentQuantities] });
    this.formChanges$.next();
  }

  updateVehicleQuantity(): void {
    this.planForm.patchValue({ vehicleQuantity: this.vehicleQuantity });
    this.formChanges$.next();
  }

  getTotalRequiredEmployees(): number {
    if (!this.planRequiredResources) return 0;
    return this.planRequiredResources.employeeQuantities
      .reduce((sum, eq) => sum + eq.quantity, 0);
  }

  getTotalRequiredEquipment(): number {
    if (!this.planRequiredResources) return 0;
    return this.planRequiredResources.equipmentQuantities
      .reduce((sum, eq) => sum + eq.quantity, 0);
  }

  getSelectionProgress(type: 'employees' | 'equipment' | 'vehicles'): number {
    if (!this.planRequiredResources) return 0;
    let selected = 0, required = 0;

    switch (type) {
      case 'employees':
        selected = this.planForm.value.selectedEmployeeIds?.length || 0;
        required = this.getTotalRequiredEmployees();
        break;
      case 'equipment':
        selected = this.planForm.value.selectedEquipmentIds?.length || 0;
        required = this.getTotalRequiredEquipment();
        break;
      case 'vehicles':
        selected = this.planForm.value.selectedVehicleIds?.length || 0;
        required = this.planRequiredResources.vehicleQuantity || 0;
        break;
    }

    if (required === 0) return selected > 0 ? 100 : 0;
    return Math.min((selected / required) * 100, 100);
  }


  get hasRequiredEmployees(): boolean {
    return !!this.planRequiredResources?.employeeQuantities?.length;
  }

  get hasRequiredEquipment(): boolean {
    return !!this.planRequiredResources?.equipmentQuantities?.length;
  }

  get hasRequiredVehicles(): boolean {
    return this.planRequiredResources?.vehicleQuantity ? this.planRequiredResources.vehicleQuantity > 0 : false;
  }
  loadRequiredResourcesFromQuantities() {
    const mode = this.planForm.value.resourceAssignmentMode;

    if (mode === ResourceAssignmentMode.DETAILED && !this.planRequiredResources) {

      const employeeQtys = this.employeeQuantities.filter(eq => eq.categoryName && eq.quantity > 0);
      const equipmentQtys = this.equipmentQuantities.filter(eq => eq.categoryName && eq.quantity > 0);
      const vehicleQty = this.vehicleQuantity || 0;

      if (employeeQtys.length > 0 || equipmentQtys.length > 0 || vehicleQty > 0) {
        this.planRequiredResources = {
          employeeQuantities: employeeQtys,
          equipmentQuantities: equipmentQtys,
          vehicleQuantity: vehicleQty
        };
        console.log('Recursos requeridos cargados desde cantidades:', this.planRequiredResources);
      } else {
        this.planRequiredResources = null;
        console.log('No hay recursos por cantidad definidos');
      }
    }
  }

  loadRequiredResourcesFromPlan(plan: any) {
    if (plan.employeeQuantities?.length > 0 ||
      plan.equipmentQuantities?.length > 0 ||
      plan.vehicleQuantity > 0) {

      this.planRequiredResources = {
        employeeQuantities: plan.employeeQuantities || [],
        equipmentQuantities: plan.equipmentQuantities || [],
        vehicleQuantity: plan.vehicleQuantity || 0
      };

    }
    else if (plan.resources) {
      if (plan.resources.mode === ResourceAssignmentMode.QUANTITY) {
        this.planRequiredResources = {
          employeeQuantities: plan.resources.employeeQuantities || [],
          equipmentQuantities: plan.resources.equipmentQuantities || [],
          vehicleQuantity: plan.resources.vehicleQuantity || 0
        };
      } else {
        const employeeCount = plan.resources.employeeIds?.length || 0;
        const equipmentCount = plan.resources.equipmentIds?.length || 0;
        const vehicleCount = plan.resources.vehicleIds?.length || 0;

        this.planRequiredResources = {
          employeeQuantities: employeeCount > 0 ? [{ categoryName: 'Personal', quantity: employeeCount }] : [],
          equipmentQuantities: equipmentCount > 0 ? [{ categoryName: 'Equipos', quantity: equipmentCount }] : [],
          vehicleQuantity: vehicleCount
        };
      }
    }
  }


  saveDetailedResourcesAndExit(): void {

    if (!this.editingPlanId) {

      this.errorMessage = 'Error: No hay un plan en edición';

      return;

    }

    const selectedEmployees = this.planForm.value.selectedEmployeeIds || [];

    if (selectedEmployees.length === 0) {

      this.errorMessage = 'Debe seleccionar al menos un empleado';

      return;

    }

    const dto = {

      mode: 'DETAILED',

      startDate: this.planForm.value.resourceStartDate || null,

      endDate: this.planForm.value.resourceEndDate || null,

      employeeIds: selectedEmployees,

      equipmentIds: this.planForm.value.selectedEquipmentIds || [],

      vehicleIds: this.planForm.value.selectedVehicleIds || [],

      employeeQuantities: null,

      equipmentQuantities: null,

      vehicleQuantity: null,

      budget: this.budgetItems.length > 0

        ? this.calculatePlanBudgetTotals(this.budgetItems)

        : null

    };

    console.log('DTO enviado:', JSON.stringify(dto, null, 2));

    this.loading = true;

    this.projectCreationService.updatePlanResources(this.editingPlanId, dto).subscribe({
      next: (response) => {
        this.successMessage = 'Recursos asignados exitosamente';
        this.loading = false;
        setTimeout(() => this.router.navigate(['/projects-dashboard']), 1500);
      },
      error: (error) => {
        console.error('Error completo:', error);
        console.error('Error.error:', error.error);
        console.error('Errores de validación:', error.error?.errors);
        console.error('Status:', error.status);

        // Mostrar errores de validación
        if (error.error?.errors) {
          console.error('DETALLES DE VALIDACIÓN:');
          Object.keys(error.error.errors).forEach(key => {
            console.error(`  - ${key}:`, error.error.errors[key]);
          });
        }

        this.errorMessage = error.error?.message || 'Error al actualizar recursos';
        this.loading = false;
      }
    });
  }


  loadReusablePlanIntoForm(plan: any): void {
    this.sitesArray.clear();

    this.planForm.patchValue({
      planCode: plan.planCode,
      planName: plan.planName,
      startDate: plan.startDate || '',
      endDate: plan.endDate || '',
      hasReport: plan.hasReport || false,
      hasGDB: plan.hasGDB || false,
      selectedMatrixIds: plan.matrixIds ||
        [...new Set((plan.sites || []).map((s: any) => s.matrixId).filter(Boolean))],
      totalSites: plan.sites?.length || 1,
      budgetItems: plan.budget?.items || []
    });

    (plan.sites || []).forEach((site: any) => {
      const siteGroup = this.fb.group({
        name: [site.name || ''],
        matrixId: [site.matrixId || ''],
        isSubcontracted: [site.isSubcontracted || false],
        subcontractorName: [site.subcontractorName || ''],
        executionDate: [site.executionDate || ''],
        hasReport: [site.hasReport || false],
        hasGDB: [site.hasGDB || false]
      });

      siteGroup.get('isSubcontracted')?.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe(isSubcontracted => {
          const subcontractorControl = siteGroup.get('subcontractorName');
          if (isSubcontracted) {
            subcontractorControl?.setValidators([Validators.required]);
          } else {
            subcontractorControl?.clearValidators();
          }
          subcontractorControl?.updateValueAndValidity();
        });

      this.sitesArray.push(siteGroup);
    });

    // Si no hay sitios, agregar uno vacío
    if (this.sitesArray.length === 0) {
      this.addSite();
    }
    
    
     this.loadRequiredResourcesFromPlan(plan);

    this.employeeQuantities = plan.employeeQuantities
      ? [...plan.employeeQuantities]
      : [];
    this.equipmentQuantities = plan.equipmentQuantities
      ? [...plan.equipmentQuantities]
      : [];
    this.vehicleQuantity = plan.vehicleQuantity || 0;

    this.editingPlanId = plan.id || plan.planCode;
    this.currentResourceMode = ResourceAssignmentMode.DETAILED;
    this.planForm.patchValue({ resourceAssignmentMode: ResourceAssignmentMode.DETAILED });
  }
  
  hasQuantityRequirements(): boolean {
    return !!(
      this.planRequiredResources?.employeeQuantities?.length ||
      this.planRequiredResources?.equipmentQuantities?.length ||
      (this.planRequiredResources?.vehicleQuantity ?? 0) > 0
    );
  }
}