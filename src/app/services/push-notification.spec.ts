import { TestBed } from '@angular/core/testing';

import { PushNotification } from './push-notification';

describe('PushNotification', () => {
  let service: PushNotification;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PushNotification);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
