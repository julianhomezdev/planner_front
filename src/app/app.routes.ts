import { Routes } from '@angular/router';
import { authGuard } from './infrastructure/guards/auth.guard';
import { loginGuard } from './infrastructure/guards/login.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./presentation/pages/auth/auth-page.component')
        .then(m => m.LoginPage)
  },
  {
    path: '',
    loadComponent: () =>
      import('./presentation/layouts/main-layout/main-layout.component')
        .then(m => m.MainLayoutComponent),
    canActivateChild: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./presentation/pages/main-page/main-page.component')
            .then(m => m.MainPage)
      },
      
      {
        path: 'logistics/vehicles',
        loadComponent: () =>
          import('./presentation/pages/logistics/vehicles-page/vehicles-page.component')
            .then(m => m.VehiclesPage)
      },
      {
        path: 'logistics/vehicles/:id',
        loadComponent: () =>
          import('./presentation/components/logistics/vehicles/vehicles-detail/vehicles-detail.component')
            .then(m => m.VehicleDetailComponent)
      },

      {
        path: 'rh/Employees',
        loadComponent: () =>
          import('./presentation/pages/rh/rh-page.component')
            .then(m => m.RhPage)
      },
      {
        path: 'logistic/equipments',
        loadComponent: () =>
          import('./presentation/pages/logistics/equipments-page/equipments-page.component')
            .then(m => m.EquipmentsPage)
      },
      {
        path: 'projects-dashboard',
        loadComponent: () =>
          import('./presentation/pages/project-dashboard/project-dashboard.component')
            .then(m => m.DashboardPage)
      },
      {
        path: 'project-drafts',
        loadComponent: () =>
          import('./presentation/pages/project-drafts/project-draft.component')
            .then(m => m.ProjectDraftsPage)
      },
      {
        
        path: 'contracts-dashboard',
        
        loadComponent: () =>
          
          import('./presentation/pages/contract-page/contract-page.component')
          
            .then(m => m.ContractPageComponent)
        
        
           
      },
      {
        path: 'planner',
        loadComponent: () =>
          import('./presentation/pages/project-wizard/project-wizard.component')
            .then(m => m.WizardPage),
        children: [
          { path: 'create-project', loadComponent: () => import('./presentation/pages/project-wizard/project-wizard.component').then(m => m.WizardPage) },
          { path: 'create-contract', loadComponent: () => import('./presentation/pages/contract/contract.component').then(m => m.ContractPage) },
          { path: 'create-budget', loadComponent: () => import('./presentation/pages/budget/budget.component').then(m => m.BudgetPage) },
          { path: 'create-sampling-plan', loadComponent: () => import('./presentation/pages/sampling-plan/sampling-plan.component').then(m => m.SamplingPlanPage) },
          { path: 'order-service', loadComponent: () => import('./presentation/pages/order-service/order-service.component').then(m => m.OrderServicePage) }
        ]
      }, {
        
        
        path: 'projects/:projectId/add-ods',
        
        loadComponent: () => import('./presentation/pages/ods-wizard-page/ods-wizard-page.component')
          .then(m => m.OdsWizardPage)        
        
      }
    ]
  }
];