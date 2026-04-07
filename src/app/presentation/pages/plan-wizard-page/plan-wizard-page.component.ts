import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PlanWizardComponent } from '../../components/plan-wizard/plan-wizard.component';

@Component({
  selector: 'plan-wizard-page',
  standalone: true,
  imports: [CommonModule, PlanWizardComponent],
  templateUrl: './plan-wizard-page.component.html',
})
export class PlanWizardPage {}
