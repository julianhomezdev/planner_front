import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/development.environment';
import { CreateProject } from '../../domain/Entities/project/project-creation.model';

@Injectable({
  
  providedIn: 'root'

})
export class ProjectCreationService {
  
  private apiUrl = `${environment.apiUrl}/Project`;

  constructor(private http: HttpClient) {}

  createCompleteProject(projectDto: CreateProject): Observable<number> {
    
    return this.http.post<number>(`${this.apiUrl}/create-complete`, projectDto);
  }


  updatePlanResources(planId: number, dto: any): Observable<any> {
    
  return this.http.patch(
    
    `${this.apiUrl}/sampling-plans/${planId}/resources`,
    dto 
    
  );
  
  }
  
  
  // Agregar ods a un contrato-proyecto
  addServiceOrderToProject(projectId : number, serviceOrderDto: any): Observable<any> {
    
    return this.http.post(`${this.apiUrl}/${projectId}/add-ods`, serviceOrderDto)
    
  }
  

}