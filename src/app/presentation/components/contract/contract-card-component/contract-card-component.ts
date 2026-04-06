import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { GrupoContrato } from '../../project-dashboard/project-dashboard.component';
import { Router } from '@angular/router';

@Component({
  selector: 'contract-card-component',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './contract-card-component.html',
})

// Componente reutilizable de card de contrato
export class ContractCardComponent {
  // contract-card-component.ts
  @Input() grupo!: GrupoContrato;

  private readonly router = inject(Router);

  // Metodo para ir al detaller de un contrato
  goContractDetail(): void {
    const projectId = this.grupo.proyectos[0]?.id;

    if (projectId) {
      this.router.navigate(['/contracts', projectId]);
    }
  }

  // Metodo para obtener planes del contrato ( información para mostar en el card)
  getContractsSamplinPlans(grupo: GrupoContrato): { planCode: string; planName: string }[] {
    return grupo.proyectos

      .flatMap((p) => p.serviceOrders ?? [])

      .flatMap((o: any) => o.samplingPlans ?? [])

      .map((sp: any) => ({ planCode: sp.planCode, planName: sp.planName }));
  }

  
}
