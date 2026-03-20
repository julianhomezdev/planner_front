import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import ContractDashboardComponent from "../../components/contract/contract-component";

@Component({
    
    selector: 'contract-page',
    standalone: true,
    imports:  [CommonModule, ContractDashboardComponent],
    templateUrl: './contract-page.component.html'
    
})

export class ContractPageComponent {}