import { Matrix } from '../matrix/matrix.model';
import { MonitoringSite } from '../project/monitoring-site';

export interface SamplingPlan {
  samplingPlanCode: string;
  sitesCount?: number;
  matrixTypes?: Matrix[];
  sites: MonitoringSite[];
}

export interface ResourceQuantityDto {
  categoryName: string;
  quantity: number;
}

export interface PlanResourcesDto {
  mode: 'QUANTITY' | 'DETAILED';
  startDate?: string;
  endDate?: string;
  employeeIds?: number[];
  equipmentIds?: number[];
  vehicleIds?: number[];
  employeeQuantities?: ResourceQuantityDto[];
  equipmentQuantities?: ResourceQuantityDto[];
  vehicleQuantity?: number;
}

export interface MonitoringSiteDto {
  name: string;
  matrixId: number;
  executionDate?: string;
  hasReport: boolean;
  hasGDB: boolean;
}

export interface PlanBudgetDto {
  chCode?: string;
  transportCostChemilab: number;
  transportBilledToClient: number;
  logisticsCostChemilab: number;
  logisticsBilledToClient: number;
  subcontractingCostChemilab: number;
  subcontractingBilledToClient: number;
  fluvialTransportCostChemilab: number;
  fluvialTransportBilledToClient: number;
  reportsCostChemilab: number;
  reportsBilledToClient: number;
  notes?: string;
}

export interface SamplingPlanDto {
  planCode: string;
  planName?: string;
  startDate?: string;
  endDate?: string;
  coordinatorId: number;
  sites: MonitoringSiteDto[];
  resources?: PlanResourcesDto;
  budget?: PlanBudgetDto;
}

export interface AddPlansToOdsDto {
  samplingPlans: SamplingPlanDto[];
}
