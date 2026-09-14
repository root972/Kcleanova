import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ShiftsHistoryService } from '../../services/shifts-history.service';

@Component({
  selector: 'app-shifts-history',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './shifts-history.html',
  styleUrls: ['./shifts-history.css']
})
export class ShiftsHistoryComponent implements OnInit {
  Math = Math;

  // LOCAL VIEW STATE (Pagination inputs)
  workerId = 5;
  currentSkip = 0;
  limit = 10;

  // DEPENDENCY INJECTION via Constructor
  // Using 'public' makes shiftsHistoryService signals directly readable in the HTML template
  constructor(
    public shiftsHistoryService: ShiftsHistoryService,
    private route: ActivatedRoute
  ) {}

  // LIFECYCLE HOOK: Automatically fetches data when page loads
  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const workerId = Number(params.get('workerId'));
      if (Number.isInteger(workerId) && workerId > 0) {
        this.workerId = workerId;
      }
      this.loadShifts();
    });
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