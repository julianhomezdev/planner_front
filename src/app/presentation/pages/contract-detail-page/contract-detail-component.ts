import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';

@Component({
  selector: 'contract-detail-page',

  standalone: true,

  imports: [CommonModule],

  templateUrl: './contract-detail-component.html',
})

// Pagina para ver el detalle de cada contrato
export class ContractDetailPage implements OnInit {
    
  private readonly route = inject(ActivatedRoute);

  private readonly projectService = inject(ProjectService);

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
}
