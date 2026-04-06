import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Router } from "@angular/router";
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuthUser, LoginRequest, LoginResponse } from "../../domain/Entities/auth/auth.model";
import { environment } from "../../environments/development.environment";

@Injectable({
  
  providedIn: 'root'
  
})


export class AuthService {
  
  private apiUrl = `${environment.apiUrl}/Auth`;
  
  private readonly TOKEN_KEY = 'auth_token';
  
  private readonly USER_KEY = 'auth_user';
  
  private currentUserSubject: BehaviorSubject<AuthUser | null>;
  public currentUser: Observable<AuthUser | null>;
  
  private platformId = inject(PLATFORM_ID);
  
  private isBrowser: boolean;
  
  constructor(
    
    private http: HttpClient,
    private router: Router
    
    
  ) {
    
    this.isBrowser = isPlatformBrowser(this.platformId);
    

    let storedUser = null;
    
    if (this.isBrowser) {
      
      const storedUserString = localStorage.getItem(this.USER_KEY);
      
      storedUser = storedUserString ? JSON.parse(storedUserString) : null;
      
    }
    
    this.currentUserSubject = new BehaviorSubject<AuthUser | null>(storedUser);
    
    this.currentUser = this.currentUserSubject.asObservable();
    
  }
  
  public get currentUserValue(): AuthUser | null {
    
    return this.currentUserSubject.value;
    
  }

  private decodeToken(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  getRole(): string | null {
    const token = this.getToken();
    if (!token) return null;

    const decoded = this.decodeToken(token);
    if (!decoded) return null;

    return decoded?.role ||
      decoded?.Role ||
      decoded?.['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      null;
  }

  hasRole(role: string): boolean {
    return this.getRole() === role;
  }
  
  login(userName: string, password: string): Observable<LoginResponse> {
    
    const loginRequest: LoginRequest = { userName, password };
    
    
    return this.http.post<LoginResponse>(`${this.apiUrl}`, loginRequest)
    
      .pipe(
        
        tap(response => {
          
          if (response && response.token && this.isBrowser) {
            
            localStorage.setItem(this.TOKEN_KEY, response.token);
            
            
            const user: AuthUser = {
              
              id: response.user.id,
              
              userName: response.user.userName,
              
              token: response.token
              
            };
            
            localStorage.setItem(this.USER_KEY, JSON.stringify(user));
            
            
            this.currentUserSubject.next(user);
          }
          
        }),
        
        catchError(this.handleError)
        
      );
      
  }
  
  logout(): void {
    
    if (this.isBrowser) {
      
      localStorage.removeItem(this.TOKEN_KEY);
      
      localStorage.removeItem(this.USER_KEY);
      
    }
    
    this.currentUserSubject.next(null);
    
    this.router.navigate(['/login']);
    
  }
  
  isAuthenticated(): boolean {
    
    return !!this.getToken();
    
  }
  
  getToken(): string | null {
    
    if (this.isBrowser) {
      
      return localStorage.getItem(this.TOKEN_KEY);
      
    }
    
    return null;
    
  }
  
  private handleError(error: HttpErrorResponse) {
    
    let errorMessage = 'Ha ocurrido un error. Intenta de nuevo.';
    
    
    if (error.status === 401) {
      
      errorMessage = 'Usuario o contraseña incorrectos';
      
    } else if (error.status === 500) {
      
      errorMessage = 'Error en el servidor';
      
    } else if (error.status === 0) {
      
      errorMessage = 'No se pudo conectar con el servidor';
      
    } else if (error.error?.message) {
      
      errorMessage = error.error.message;
      
    }
    
    return throwError(() => new Error(errorMessage));
    
  }
  
}