import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/development.environment';

@Injectable({
  
  providedIn: 'root'
  
})

export class ProjectService {
  
  private apiUrl = `${environment.apiUrl}/Project`;

  constructor(private http: HttpClient) {}

  getAllProjects(): Observable<any[]> {

    return this.http.get<any[]>(`${this.apiUrl}`);
  
  }

  getProjectById(id: number): Observable<any> {
  
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  
  }

  deleteProject(id: number): Observable<void> {
  
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  
  }

  getProjectWithResourceDetails(id: number): Observable<any> {
  
    return this.http.get<any>(`${this.apiUrl}/${id}/details`);
  
  }
}