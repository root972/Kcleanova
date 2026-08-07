import { Component, OnInit, signal } from '@angular/core';
import { PushNotificationService } from './services/push-notification';
 
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  standalone: false,
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('Meineangularproject');
 
  constructor(private pushService: PushNotificationService) {}
 
  ngOnInit(): void {
    this.pushService.syncSubscription();
  }
}
 