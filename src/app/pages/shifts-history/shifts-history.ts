import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { ShiftsHistoryService } from '../../services/shifts-history.service';
import { environment } from '../../../environments/environment';

interface WorkerSummary {
  id: number;
  name: string;
  email: string;
}

@Component({
  selector: 'app-shifts-history',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './shifts-history.html',
  styleUrls: ['./shifts-history.css']
})
export class ShiftsHistoryComponent implements OnInit {
  Math = Math;
  workers: WorkerSummary[] = [];
  searchTerm = '';

  // LOCAL VIEW STATE (Pagination inputs)
  workerId = 5;
  currentSkip = 0;
  limit = 10;

  // DEPENDENCY INJECTION via Constructor
  // Using 'public' makes shiftsHistoryService signals directly readable in the HTML template
  constructor(
    public shiftsHistoryService: ShiftsHistoryService,
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  // LIFECYCLE HOOK: Automatically fetches data when page loads
  ngOnInit(): void {
    this.loadWorkers();
    this.route.queryParamMap.subscribe((params) => {
      const workerId = Number(params.get('workerId'));
      if (Number.isInteger(workerId) && workerId > 0) {
        this.workerId = workerId;
      }
      this.loadShifts();
    });
  }

  get filteredWorkers(): WorkerSummary[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) return this.workers;

    return this.workers.filter((worker) =>
      worker.name.toLowerCase().includes(query) ||
      worker.id.toString().includes(query)
    );
  }

  private loadWorkers(): void {
    this.http.get<any[]>(`${environment.apiUrl}/api/workers`).pipe(
      catchError((error) => {
        console.error('Error fetching workers:', error);
        return of([]);
      })
    ).subscribe((workers) => {
      this.workers = workers
        .filter((worker) => worker?.id)
        .map((worker) => ({
          id: worker.id,
          name: worker.user?.name || `Worker ${worker.id}`,
          email: worker.user?.email || ''
        }));
    });
  }

  selectWorker(workerId: number): void {
    this.currentSkip = 0;
    this.workerId = workerId;
    this.router.navigate(['/shifts-history'], { queryParams: { workerId } });
    this.loadShifts();
  }

  // TRIGGER METHOD: Invokes service method and calls .subscribe() to execute HTTP request
  loadShifts(): void {
    this.shiftsHistoryService
      .getShiftHistoryByWorkerId(this.workerId, this.currentSkip, this.limit)
      .subscribe();
  }

  // USER EVENT HANDLERS
  nextPage(): void {
    this.currentSkip += this.limit;
    this.loadShifts();
  }

  prevPage(): void {
    if (this.currentSkip >= this.limit) {
      this.currentSkip -= this.limit;
      this.loadShifts();
    }
  }
}