import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { EmployeeService } from '../../../core/services/employee.service';
import { EquipmentService } from '../../../core/services/equipment.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { MatrixService } from '../../../core/services/matrix.service';
import { ProjectCoordinatorService } from '../../../core/services/project-coordinator.service';
import { ProjectCreationService } from '../../../core/services/project-creation.service';

import { Employee } from '../../../domain/Entities/employee/employee.model';
import { Vehicle } from '../../../domain/Entities/vehicle/vehicle.model';
import { Equipment } from '../../../domain/Entities/Equipment/equipment.model';
import { Coordinator } from '../../../domain/Entities/coordinator/coordinator.model';
import { Matrix } from '../../../domain/Entities/matrix/matrix.model';
import { ResourceAssignmentMode } from '../../../domain/enums/resource-assignment-mode.enum';
import { EmployeeMonthlyAvailability } from '../../../domain/Entities/employee/employee-monthly-availabilty.model';
import { CommonModule } from '@angular/common';

enum BudgetCategory {
  TRANSPORT = 'TRANSPORTE',
  LOGISTICS = 'LOGÍSTICA',
  SUBCONTRACTING = 'SUBCONTRATACIÓN',
  RIVER_TRANSPORT = 'TRANSPORTE FLUVIAL',
  REPORTS = 'INFORMES',
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
  selector: 'plan-wizard-component',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './plan-wizard.component.html',
})
export class PlanWizardComponent implements OnInit, OnDestroy {
  // ── Inyecciones ────────────────────────────────────────────────────────────
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private employeeService = inject(EmployeeService);
  private equipmentService = inject(EquipmentService);
  private vehicleService = inject(VehicleService);
  private matrixService = inject(MatrixService);
  private coordinatorService = inject(ProjectCoordinatorService);
  private projectCreationService = inject(ProjectCreationService);

  // ── Enums al template ─────────────────────────────────────────────────────
  BudgetCategory = BudgetCategory;
  ResourceAssignmentMode = ResourceAssignmentMode;
  Math = Math;

  // ── Params ────────────────────────────────────────────────────────────────
  contractId!: number;
  odsId!: number;

  // ── Estado ────────────────────────────────────────────────────────────────
  loading = false;
  dataReady = false;
  errorMessage = '';
  successMessage = '';

  // ── Planes en construcción ────────────────────────────────────────────────
  stagedPlans: any[] = [];
  editingPlanIndex: number | null = null;

  // ── Formularios ───────────────────────────────────────────────────────────
  planForm!: FormGroup;
  budgetItemForm!: FormGroup;

  // ── Catálogos ─────────────────────────────────────────────────────────────
  employees: Employee[] = [];
  equipment: Equipment[] = [];
  vehicles: Vehicle[] = [];
  matrices: Matrix[] = [];
  coordinators: Coordinator[] = [];

  employeeCategories: string[] = [];
  equipmentCategories: string[] = [];

  // ── Recursos disponibles ──────────────────────────────────────────────────
  availableEmployees: any[] = [];
  availableEquipment: any[] = [];
  availableVehicles: any[] = [];
  resourceDatesSet = false;
  employeeMonthlyAvailability: Map<number, EmployeeMonthlyAvailability> = new Map();
  private resourcesLoadedCount = 0;

  // ── Modo asignación ───────────────────────────────────────────────────────
  currentResourceMode: ResourceAssignmentMode = ResourceAssignmentMode.QUANTITY;
  employeeQuantities: ResourceQuantity[] = [];
  equipmentQuantities: ResourceQuantity[] = [];
  vehicleQuantity = 0;

  // ── Filtros ───────────────────────────────────────────────────────────────
  employeeSearchTerm = '';
  equipmentSearchTerm = '';
  vehicleSearchTerm = '';
  employeeCategoryFilter = '';
  equipmentCategoryFilter = '';
  vehicleLocationFilter = '';

  // ── Budget modal ──────────────────────────────────────────────────────────
  showBudgetItemModal = false;
  editingBudgetItemIndex = -1;

  private destroy$ = new Subject<void>();

  // ═══════════════════════════════════════════════════════════════════════════
  // CICLO DE VIDA
  // ═══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.contractId = Number(this.route.snapshot.paramMap.get('contractId'));
    this.odsId = Number(this.route.snapshot.paramMap.get('odsId'));

    const startDate = this.route.snapshot.queryParamMap.get('startDate') ?? '';
    const endDate = this.route.snapshot.queryParamMap.get('endDate') ?? '';

    this.initForms(startDate, endDate);
    this.loadCatalogs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGA DE DATOS
  // ═══════════════════════════════════════════════════════════════════════════

  private loadCatalogs(): void {
    this.loading = true;
    Promise.all([
      this.employeeService.getAllEmployees().toPromise(),
      this.equipmentService.getAllEquipment().toPromise(),
      this.vehicleService.getAllVehicles().toPromise(),
      this.matrixService.getAllMatrix().toPromise(),
      this.coordinatorService.getAllCoordinators().toPromise(),
    ])
      .then(([employees, equipment, vehicles, matrices, coordinators]) => {
        this.employees = employees || [];
        this.equipment = equipment || [];
        this.vehicles = vehicles || [];
        this.matrices = matrices || [];
        this.coordinators = coordinators || [];

        this.employeeCategories = [
          ...new Set(this.employees.map((e) => e.position).filter(Boolean)),
        ];
        this.equipmentCategories = [...new Set(this.equipment.map((e) => e.name).filter(Boolean))];

        this.dataReady = true;
        this.loading = false;
      })
      .catch(() => {
        this.errorMessage = 'Error al cargar los datos necesarios';
        this.loading = false;
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMULARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  private initForms(startDate = '', endDate = ''): void {
    this.planForm = this.fb.group({
      planCode: ['', Validators.required],
      planName: ['', Validators.required],
      startDate: [startDate],
      endDate: [endDate],
      totalSites: [1, [Validators.required, Validators.min(1)]],
      selectedMatrixIds: [[], Validators.required],
      hasReport: [false],
      hasGDB: [false],
      coordinatorId: ['', Validators.required],
      sites: this.fb.array([]),
      resourceAssignmentMode: [ResourceAssignmentMode.QUANTITY],
      employeeQuantities: [[]],
      equipmentQuantities: [[]],
      vehicleQuantity: [0],
      resourceStartDate: [startDate],
      resourceEndDate: [endDate],
      selectedEmployeeIds: [[]],
      selectedEquipmentIds: [[]],
      selectedVehicleIds: [[]],
      budgetItems: [[]],
      notes: [''],
    });

    this.budgetItemForm = this.fb.group({
      category: [BudgetCategory.TRANSPORT, Validators.required],
      concept: ['', Validators.required],
      provider: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['días', Validators.required],
      costPerUnit: [0, [Validators.required, Validators.min(0)]],
      billedPerUnit: [0, [Validators.required, Validators.min(0)]],
      notes: [''],
    });

    this.addSite();

    this.planForm
      .get('resourceStartDate')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadAvailableResources());
    this.planForm
      .get('resourceEndDate')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadAvailableResources());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SITIOS
  // ═══════════════════════════════════════════════════════════════════════════

  get sitesArray(): FormArray {
    return this.planForm.get('sites') as FormArray;
  }

  private buildSiteGroup(name = ''): FormGroup {
    const g = this.fb.group({
      name: [name],
      matrixId: [''],
      isSubcontracted: [false],
      subcontractorName: [''],
      executionDate: [''],
      hasReport: [false],
      hasGDB: [false],
    });
    g.get('isSubcontracted')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        const ctrl = g.get('subcontractorName');
        val ? ctrl?.setValidators([Validators.required]) : ctrl?.clearValidators();
        ctrl?.updateValueAndValidity();
      });
    return g;
  }

  addSite(): void {
    this.sitesArray.push(this.buildSiteGroup());
  }
  removeSite(i: number): void {
    if (this.sitesArray.length > 1) this.sitesArray.removeAt(i);
  }

  clearSites(): void {
    this.sitesArray.clear();
    this.addSite(); // deja al menos uno vacío
  }

  generateSites(): void {
    const count = this.planForm.value.totalSites || 1;
    const planCode = this.planForm.value.planCode;
    const planName = this.planForm.value.planName;
    const startDate = this.planForm.value.startDate;
    const endDate = this.planForm.value.endDate;

    if (!planCode || !planName) {
      this.errorMessage = 'Complete el código y nombre del plan antes de generar sitios';
      return;
    }

    const dates = this.distributeDates(startDate, endDate, count);
    this.sitesArray.clear();
    for (let i = 0; i < count; i++) {
      const g = this.buildSiteGroup(`Sitio #${i + 1} ${planName}-${planCode}`);
      g.patchValue({ executionDate: dates[i] });
      this.sitesArray.push(g);
    }
  }

  // Reemplaza el distributeDates viejo por este
  private distributeDates(start: string, end: string, count: number): string[] {
    if (!start || !end || count <= 0) return Array(count).fill('');

    const s = new Date(start);
    const e = new Date(end);
    const totalDays = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    const sitesPerDay = Math.ceil(count / totalDays);

    return Array.from({ length: count }, (_, i) => {
      const dayIndex = Math.floor(i / sitesPerDay);
      const d = new Date(s);
      d.setDate(d.getDate() + dayIndex);
      return (d > e ? e : d).toISOString().split('T')[0];
    });
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // MATRICES
  // ═══════════════════════════════════════════════════════════════════════════

  toggleMatrix(id: number): void {
    const curr = [...(this.planForm.value.selectedMatrixIds || [])];
    const idx = curr.indexOf(id);
    idx === -1 ? curr.push(id) : curr.splice(idx, 1);
    this.planForm.patchValue({ selectedMatrixIds: curr });
  }
  isMatrixSelected(id: number): boolean {
    return (this.planForm.value.selectedMatrixIds || []).includes(id);
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
    const s = this.planForm.value.resourceStartDate;
    const e = this.planForm.value.resourceEndDate;
    if (!s || !e) {
      this.resourceDatesSet = false;
      return;
    }
    this.resourceDatesSet = true;
    this.loading = true;
    this.resourcesLoadedCount = 0;

    const now = new Date();
    this.employeeService.getMonthlyAvailability(now.getFullYear(), now.getMonth() + 1).subscribe({
      next: (av) => (this.employeeMonthlyAvailability = new Map(av.map((a) => [a.employeeId, a]))),
      error: () => (this.employeeMonthlyAvailability = new Map()),
    });

    this.employeeService.getAvailableEmployees(s, e).subscribe({
      next: (av) => {
        this.availableEmployees = this.employees.map((em) => ({
          ...em,
          isAvailable: av?.find((a: any) => a.id === em.id)?.isAvailable ?? false,
        }));
        this.checkLoaded();
      },
      error: () => {
        this.availableEmployees = this.employees.map((em) => ({ ...em, isAvailable: false }));
        this.checkLoaded();
      },
    });
    this.equipmentService.getAvailableEquipment(s, e).subscribe({
      next: (av) => {
        this.availableEquipment = this.equipment.map((eq) => ({
          ...eq,
          isAvailable: av?.find((a: any) => a.id === eq.id)?.isAvailable ?? false,
        }));
        this.checkLoaded();
      },
      error: () => {
        this.availableEquipment = this.equipment.map((eq) => ({ ...eq, isAvailable: false }));
        this.checkLoaded();
      },
    });
    this.vehicleService.getAvailableVehicles(s, e).subscribe({
      next: (av) => {
        this.availableVehicles = this.vehicles.map((v) => ({
          ...v,
          isAvailable: av?.find((a: any) => a.id === v.id)?.isAvailable ?? false,
        }));
        this.checkLoaded();
      },
      error: () => {
        this.availableVehicles = this.vehicles.map((v) => ({ ...v, isAvailable: false }));
        this.checkLoaded();
      },
    });
  }

  private checkLoaded(): void {
    if (++this.resourcesLoadedCount >= 3) {
      this.loading = false;
      this.resourcesLoadedCount = 0;
    }
  }

  // Filtros
  get filteredEmployees() {
    return this.availableEmployees.filter((e) => {
      const t = this.employeeSearchTerm.toLowerCase();
      return (
        (!t || e.name?.toLowerCase().includes(t) || e.position?.toLowerCase().includes(t)) &&
        (!this.employeeCategoryFilter || e.position === this.employeeCategoryFilter)
      );
    });
  }
  get filteredEquipment() {
    return this.availableEquipment.filter((e) => {
      const t = this.equipmentSearchTerm.toLowerCase();
      return (
        (!t || e.name?.toLowerCase().includes(t) || e.code?.toLowerCase().includes(t)) &&
        (!this.equipmentCategoryFilter || e.name === this.equipmentCategoryFilter)
      );
    });
  }
  get filteredVehicles() {
    return this.availableVehicles.filter((v) => {
      const t = this.vehicleSearchTerm.toLowerCase();
      return (
        (!t || v.plateNumber?.toLowerCase().includes(t) || v.brand?.toLowerCase().includes(t)) &&
        (!this.vehicleLocationFilter || v.location === this.vehicleLocationFilter)
      );
    });
  }
  get uniqueEmployeeCategories(): string[] {
    return [...new Set(this.employees.map((e) => e.position).filter(Boolean))];
  }
  get uniqueEquipmentCategories(): string[] {
    return [...new Set(this.equipment.map((e) => e.name).filter(Boolean))];
  }
  get uniqueVehicleLocations(): string[] {
    return [...new Set(this.vehicles.map((v) => v.location).filter(Boolean))];
  }

  // Selección
  toggleEmployee(id: number): void {
    this.toggleArr('selectedEmployeeIds', id);
  }
  toggleEquipment(id: number): void {
    this.toggleArr('selectedEquipmentIds', id);
  }
  toggleVehicle(id: number): void {
    this.toggleArr('selectedVehicleIds', id);
    const sel = (this.planForm.value.selectedVehicleIds || []).includes(id);
    sel ? this.addVehicleToBudget(id) : this.removeVehicleFromBudget(id);
  }
  isEmployeeSelected(id: number): boolean {
    return (this.planForm.value.selectedEmployeeIds || []).includes(id);
  }
  isEquipmentSelected(id: number): boolean {
    return (this.planForm.value.selectedEquipmentIds || []).includes(id);
  }
  isVehicleSelected(id: number): boolean {
    return (this.planForm.value.selectedVehicleIds || []).includes(id);
  }

  private toggleArr(field: string, id: number): void {
    const curr = [...(this.planForm.value[field] || [])];
    const idx = curr.indexOf(id);
    idx === -1 ? curr.push(id) : curr.splice(idx, 1);
    this.planForm.patchValue({ [field]: curr });
  }

  // Disponibilidad mensual
  getEmployeeRemainingDays(id: number): number {
    return Math.max(0, this.employeeMonthlyAvailability.get(id)?.remainingDays ?? 20);
  }
  getEmployeeWorkedDays(id: number): number {
    return this.employeeMonthlyAvailability.get(id)?.workedDays ?? 0;
  }
  getEmployeeWorkDaysPerMonth(id: number): number {
    return this.employeeMonthlyAvailability.get(id)?.workDaysPerMonth ?? 20;
  }
  isEmployeeMonthFull(id: number): boolean {
    return this.getEmployeeRemainingDays(id) <= 0;
  }
  getRemainingDaysColor(id: number): string {
    const r = this.getEmployeeRemainingDays(id);
    return r <= 0 ? 'text-red-600' : r <= 5 ? 'text-amber-600' : 'text-emerald-600';
  }

  // Cantidades
  addEmployeeQty(): void {
    this.employeeQuantities.push({ categoryName: '', quantity: 1 });
    this.syncQty();
  }
  removeEmployeeQty(i: number): void {
    this.employeeQuantities.splice(i, 1);
    this.syncQty();
  }
  addEquipmentQty(): void {
    this.equipmentQuantities.push({ categoryName: '', quantity: 1 });
    this.syncQty();
  }
  removeEquipmentQty(i: number): void {
    this.equipmentQuantities.splice(i, 1);
    this.syncQty();
  }
  updateVehicleQty(): void {
    this.planForm.patchValue({ vehicleQuantity: this.vehicleQuantity });
  }

  private syncQty(): void {
    this.planForm.patchValue({
      employeeQuantities: [...this.employeeQuantities],
      equipmentQuantities: [...this.equipmentQuantities],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESUPUESTO
  // ═══════════════════════════════════════════════════════════════════════════

  get budgetItems(): BudgetItem[] {
    return this.planForm.value.budgetItems || [];
  }
  get budgetCategories() {
    return Object.values(BudgetCategory);
  }

  openBudgetModal(): void {
    this.budgetItemForm.reset({
      category: BudgetCategory.TRANSPORT,
      quantity: 1,
      unit: 'días',
      costPerUnit: 0,
      billedPerUnit: 0,
    });
    this.editingBudgetItemIndex = -1;
    this.showBudgetItemModal = true;
  }
  editBudgetItem(i: number): void {
    this.budgetItemForm.patchValue(this.budgetItems[i]);
    this.editingBudgetItemIndex = i;
    this.showBudgetItemModal = true;
  }
  closeBudgetModal(): void {
    this.showBudgetItemModal = false;
    this.editingBudgetItemIndex = -1;
    this.budgetItemForm.reset();
  }

  saveBudgetItem(): void {
    if (!this.budgetItemForm.valid) return;
    const item: BudgetItem = {
      id:
        this.editingBudgetItemIndex === -1
          ? this.genId()
          : this.budgetItems[this.editingBudgetItemIndex].id,
      ...this.budgetItemForm.value,
    };
    const items = [...this.budgetItems];
    this.editingBudgetItemIndex === -1
      ? items.push(item)
      : (items[this.editingBudgetItemIndex] = item);
    this.planForm.patchValue({ budgetItems: items });
    this.closeBudgetModal();
  }
  removeBudgetItem(i: number): void {
    const items = [...this.budgetItems];
    items.splice(i, 1);
    this.planForm.patchValue({ budgetItems: items });
  }

  get budgetCostTotal(): number {
    return this.budgetItems.reduce((s, i) => s + i.quantity * i.costPerUnit, 0);
  }
  get budgetBilledTotal(): number {
    return this.budgetItems.reduce((s, i) => s + i.quantity * i.billedPerUnit, 0);
  }
  get budgetProfit(): number {
    return this.budgetBilledTotal - this.budgetCostTotal;
  }

  private addVehicleToBudget(vehicleId: number): void {
    const v = this.availableVehicles.find((v) => v.id === vehicleId);
    const s = this.planForm.value.resourceStartDate,
      e = this.planForm.value.resourceEndDate;
    if (!v || !s || !e || !v.costPerDay) return;
    const days = Math.ceil(Math.abs(new Date(e).getTime() - new Date(s).getTime()) / 86400000);
    const item: BudgetItem = {
      id: `vehicle-${vehicleId}`,
      category: BudgetCategory.TRANSPORT,
      concept: `Vehículo ${v.plateNumber} - ${v.brand} ${v.model}`,
      provider: v.plateNumber,
      quantity: days,
      unit: 'días',
      costPerUnit: v.costPerDay,
      billedPerUnit: v.costPerDay,
      notes: 'Auto-generado',
    };
    const items = [...this.budgetItems];
    if (!items.find((i) => i.id === item.id)) {
      items.push(item);
      this.planForm.patchValue({ budgetItems: items });
    }
  }
  private removeVehicleFromBudget(id: number): void {
    this.planForm.patchValue({
      budgetItems: this.budgetItems.filter((i) => i.id !== `vehicle-${id}`),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STAGING Y SUBMIT
  // ═══════════════════════════════════════════════════════════════════════════

  addPlanToStaging(): void {
    if (!this.planForm.valid) {
      this.errorMessage = 'Complete los campos requeridos del plan';
      return;
    }
    if (!this.sitesArray.length) {
      this.errorMessage = 'Agregue al menos un sitio';
      return;
    }
    if (!this.planForm.value.selectedMatrixIds?.length) {
      this.errorMessage = 'Seleccione al menos una matriz';
      return;
    }

    const mode = this.planForm.value.resourceAssignmentMode;
    if (mode === ResourceAssignmentMode.QUANTITY) {
      const hasR =
        this.employeeQuantities.some((e) => e.categoryName && e.quantity > 0) ||
        this.equipmentQuantities.some((e) => e.categoryName && e.quantity > 0) ||
        this.vehicleQuantity > 0;
      if (!hasR) {
        this.errorMessage = 'Agregue al menos un recurso';
        return;
      }
    } else {
      if (!this.planForm.value.selectedEmployeeIds?.length) {
        this.errorMessage = 'Seleccione al menos un empleado';
        return;
      }
    }

    const selectedMatrices = this.matrices.filter((m) =>
      this.planForm.value.selectedMatrixIds.includes(m.id),
    );
    const coordinator = this.coordinators.find(
      (c) => c.id === Number(this.planForm.value.coordinatorId),
    );

    const sites = this.sitesArray.value.map((s: any) => ({
      name: s.name,
      matrixIds: this.planForm.value.selectedMatrixIds,
      matrixNames: selectedMatrices.map((m) => m.matrixName).join(', '),
      isSubcontracted: s.isSubcontracted,
      subcontractorName: s.isSubcontracted ? s.subcontractorName?.trim() || null : null,
      executionDate: s.executionDate || null,
      hasReport: this.planForm.value.hasReport,
      hasGDB: this.planForm.value.hasGDB,
    }));

    const planData: any = {
      planCode: this.planForm.value.planCode,
      planName: this.planForm.value.planName,
      startDate: this.planForm.value.startDate,
      endDate: this.planForm.value.endDate,
      matrixIds: this.planForm.value.selectedMatrixIds,
      matrixNames: selectedMatrices.map((m) => m.matrixName).join(', '),
      coordinatorId: Number(this.planForm.value.coordinatorId),
      coordinatorName: coordinator?.name || '',
      hasReport: this.planForm.value.hasReport,
      hasGDB: this.planForm.value.hasGDB,
      sites,
      budget: { items: this.budgetItems, notes: this.planForm.value.notes },
    };

    if (mode === ResourceAssignmentMode.QUANTITY) {
      planData.resourceAssignmentMode = 'quantity';
      planData.employeeQuantities = this.employeeQuantities.filter(
        (e) => e.categoryName && e.quantity > 0,
      );
      planData.equipmentQuantities = this.equipmentQuantities.filter(
        (e) => e.categoryName && e.quantity > 0,
      );
      planData.vehicleQuantity = this.vehicleQuantity;
      planData.resourceStartDate = this.planForm.value.resourceStartDate;
      planData.resourceEndDate = this.planForm.value.resourceEndDate;
      planData.resources = null;
    } else {
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
        employees: this.employees.filter((e) =>
          (this.planForm.value.selectedEmployeeIds || []).includes(e.id),
        ),
        equipment: this.equipment.filter((e) =>
          (this.planForm.value.selectedEquipmentIds || []).includes(e.id),
        ),
        vehicles: this.vehicles.filter((v) =>
          (this.planForm.value.selectedVehicleIds || []).includes(v.id),
        ),
      };
    }

    if (this.editingPlanIndex !== null) {
      this.stagedPlans[this.editingPlanIndex] = planData;
      this.editingPlanIndex = null;
    } else {
      this.stagedPlans.push(planData);
    }

    this.resetPlanForm();
    this.successMessage = 'Plan agregado';
    setTimeout(() => (this.successMessage = ''), 3000);
  }

  editStagedPlan(index: number): void {
    const plan = this.stagedPlans[index];
    this.editingPlanIndex = index;
    this.sitesArray.clear();
    (plan.sites || []).forEach((s: any) => {
      this.sitesArray.push(this.buildSiteGroup(s.name));
      (this.sitesArray.at(this.sitesArray.length - 1) as FormGroup).patchValue(s);
    });
    if (!this.sitesArray.length) this.addSite();
    this.planForm.patchValue({
      planCode: plan.planCode,
      planName: plan.planName,
      startDate: plan.startDate || '',
      endDate: plan.endDate || '',
      selectedMatrixIds: plan.matrixIds || [],
      hasReport: plan.hasReport || false,
      hasGDB: plan.hasGDB || false,
      coordinatorId: plan.coordinatorId,
      totalSites: plan.sites?.length || 1,
      budgetItems: plan.budget?.items || [],
      resourceStartDate: plan.resourceStartDate || '',
      resourceEndDate: plan.resourceEndDate || '',
    });
    this.employeeQuantities = plan.employeeQuantities ? [...plan.employeeQuantities] : [];
    this.equipmentQuantities = plan.equipmentQuantities ? [...plan.equipmentQuantities] : [];
    this.vehicleQuantity = plan.vehicleQuantity || 0;
    this.currentResourceMode =
      plan.resourceAssignmentMode === 'detailed'
        ? ResourceAssignmentMode.DETAILED
        : ResourceAssignmentMode.QUANTITY;
  }

  removeStagedPlan(index: number): void {
    this.stagedPlans.splice(index, 1);
  }

  resetPlanForm(): void {
    this.planForm.reset({
      resourceAssignmentMode: ResourceAssignmentMode.QUANTITY,
      employeeQuantities: [],
      equipmentQuantities: [],
      vehicleQuantity: 0,
      selectedEmployeeIds: [],
      selectedEquipmentIds: [],
      selectedVehicleIds: [],
      budgetItems: [],
    });
    this.currentResourceMode = ResourceAssignmentMode.QUANTITY;
    this.employeeQuantities = [];
    this.equipmentQuantities = [];
    this.vehicleQuantity = 0;
    this.editingPlanIndex = null;
    this.sitesArray.clear();
    this.addSite();
  }

  canSave(): boolean {
    return this.stagedPlans.length > 0;
  }

  savePlans(): void {
    if (!this.canSave()) {
      this.errorMessage = 'Agregue al menos un plan';
      return;
    }
    this.loading = true;
    this.errorMessage = '';

    const dto = {
      samplingPlans: this.stagedPlans.map((plan) => ({
        planCode: plan.planCode,
        planName: plan.planName,
        startDate: plan.startDate || null,
        endDate: plan.endDate || null,
        coordinatorId: plan.coordinatorId,
        sites: plan.sites.map((s: any) => ({
          name: s.name,
          matrixId: Array.isArray(s.matrixIds) ? s.matrixIds[0] : s.matrixId || 0,
          executionDate: s.executionDate || null,
          hasReport: s.hasReport || false,
          hasGDB: s.hasGDB || false,
        })),
        resources: {
          mode: plan.resourceAssignmentMode?.toUpperCase() || 'QUANTITY',
          startDate: plan.resourceStartDate || null,
          endDate: plan.resourceEndDate || null,
          employeeIds: plan.resources?.employeeIds || [],
          equipmentIds: plan.resources?.equipmentIds || [],
          vehicleIds: plan.resources?.vehicleIds || [],
          employeeQuantities: plan.employeeQuantities || [],
          equipmentQuantities: plan.equipmentQuantities || [],
          vehicleQuantity: plan.vehicleQuantity || 0,
        },
        budget: this.calcBudget(plan.budget?.items || []),
      })),
    };

    this.projectCreationService.addSamplingPlanToOds(this.odsId, dto).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = '¡Planes guardados exitosamente!';
        setTimeout(() => this.router.navigate(['/contracts', this.contractId]), 1500);
      },
      error: (err: any) => {
        this.errorMessage = err.error?.message || 'Error al guardar los planes';
        this.loading = false;
      },
    });
  }

  private calcBudget(items: BudgetItem[]) {
    const t = {
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
      notes: '',
    };
    items.forEach((item) => {
      const cost = item.quantity * item.costPerUnit,
        billed = item.quantity * item.billedPerUnit;
      switch (item.category) {
        case BudgetCategory.TRANSPORT:
          t.transportCostChemilab += cost;
          t.transportBilledToClient += billed;
          break;
        case BudgetCategory.LOGISTICS:
          t.logisticsCostChemilab += cost;
          t.logisticsBilledToClient += billed;
          break;
        case BudgetCategory.SUBCONTRACTING:
          t.subcontractingCostChemilab += cost;
          t.subcontractingBilledToClient += billed;
          break;
        case BudgetCategory.RIVER_TRANSPORT:
          t.fluvialTransportCostChemilab += cost;
          t.fluvialTransportBilledToClient += billed;
          break;
        case BudgetCategory.REPORTS:
          t.reportsCostChemilab += cost;
          t.reportsBilledToClient += billed;
          break;
      }
    });
    return t;
  }

  goBack(): void {
    this.router.navigate(['/contracts', this.contractId]);
  }
  private genId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
