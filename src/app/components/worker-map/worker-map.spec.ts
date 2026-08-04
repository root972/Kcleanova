import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkerMap } from './worker-map';

describe('WorkerMap', () => {
  let component: WorkerMap;
  let fixture: ComponentFixture<WorkerMap>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WorkerMap],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkerMap);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
