import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { AddOdsWizardComponent } from "../../components/ods-wizard/ods-wizard.component";

@Component({
    
    selector: 'ods-wizard-page',
    standalone: true,
    imports: [CommonModule, AddOdsWizardComponent],
    templateUrl: './ods-wizard-page.component.html'
    
    
    
})


export class OdsWizardPage {
    
    
    
}