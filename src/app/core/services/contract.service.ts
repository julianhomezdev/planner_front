import { Component, inject, Injectable } from "@angular/core";
import { environment } from "../../environments/development.environment";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { Contract } from "../../domain/Entities/contract/contract.model";

@Injectable({
    
   providedIn: 'root'
    
})


export class ContractService{
    
    private http = inject(HttpClient);
    
    private apiUrl = `${environment.apiUrl}/Contract`;
    
    
    
    createContract(contract : Contract): Observable<Contract> {
        
        return this.http.post<Contract>(this.apiUrl, contract);
        
        
    }
    
 
    
    getContracts(): Observable<Contract[]> {
        
        
        return this.http.get<Contract[]>(`${this.apiUrl}`);
        
    }
    
    
    
}