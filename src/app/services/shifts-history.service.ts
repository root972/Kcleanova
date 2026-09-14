import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { Shift, ShiftHistoryResponse } from '../models/shifts.model';

@Injectable({
  providedIn: 'root'
})
export class ShiftsHistoryService {
  private apiUrl = 'http://localhost:3000/api/shifts/worker';

  // Reactive State Management using Angular Signals
  shifts = signal<Shift[]>([]);
  totalCount = signal<number>(0);
  isLoading = signal<boolean>(false);

  constructor(private http: HttpClient) {}

  /**
   * Fetches paginated shift history for a specific worker.
   * Maps to Express route: GET /api/shifts/worker/:workerId?skip=0&limit=10
   */
  getShiftHistoryByWorkerId(
    workerId: number, 
    skip: number = 0, 
    limit: number = 10
  ): Observable<ShiftHistoryResponse> {
    this.isLoading.set(true);

    const params = new HttpParams()
      .set('skip', skip.toString())
      .set('limit', limit.toString());

    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<ShiftHistoryResponse>(`${this.apiUrl}/${workerId}`, { params, headers }).pipe(
      tap({
        next: (response) => {
          // Update Signals with fresh data from backend
          this.shifts.set(response.shifts);
          this.totalCount.set(response.totalCount);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.isLoading.set(false);
          console.error('Error fetching worker shift history:', err);
        }
      }),
      catchError((err) => {
        this.shifts.set([]);
        this.totalCount.set(0);
        this.isLoading.set(false);
        console.error('Error fetching worker shift history:', err);
        return of({ shifts: [], totalCount: 0, skip, limit });
      })
    );
  }

  /**
   * Business Logic Utility: Converts accumulated hours into 10-hour shift units
   * (e.g., 25 logged hours = 2.5 shift units)
   */
  calculateShiftUnitsFromHours(totalHours: number): number {
    if (!totalHours || totalHours <= 0) return 0;
    return Number((totalHours / 10).toFixed(1));
  }
}