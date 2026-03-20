import { CommonModule } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { ContractService } from "../../../core/services/contract.service";

@Component({
    
    selector: 'contract-dashboard-component',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './contract-component.html'
    
})


export default class ContractDashboardComponent implements OnInit {
    
    
    private contractService = inject(ContractService);
    
    contracts: any[] = [];
    
    loading: boolean = false;
    
    ngOnInit(): void {
        
        this.loadContracts();
        
    }
    
    loadContracts(): void {
        
        this.contractService.getContracts().subscribe({
            
            
            next: (data) => {
                
                this.contracts = data;
                
                console.log(data);
                
                this.loading = false;
            },
            error: (error) => {
                
                console.error('Error cargando contratos:', error);
                
                this.loading = false;
                
            }
            
            
        })
    
  }
  
  
}