// src/app/models/shifts.model.ts

export interface Shift {
  id: number;
  workerId: number;
  startTime: string;
  endTime: string;
  location: string;
  notes?: string;
}

export interface ShiftHistoryResponse {
  shifts: Shift[];      
  totalCount: number;   
  skip: number;
  limit: number;
}