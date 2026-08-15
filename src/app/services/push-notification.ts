import { Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';
import { take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
 
@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  readonly VAPID_PUBLIC_KEY = 'BKu6cBdoysT9LG-4aCDWAnGfG4-oNf54IHaSsedvXJeKTujT-bt6y562LTjwpLi01WbwPjP4r9scI0Sz09vacTY';
  private readonly BACKEND_URL = environment.apiUrl;
 
  constructor(
    private swPush: SwPush,
    private http: HttpClient
  ) {}
 
  // ✅ Call this once on app init (in AppComponent.ngOnInit)
  // It checks if browser already has a subscription and re-posts it to backend
  // This ensures Node always has the subscription even after a restart
  syncSubscription(): void {
    if (!this.swPush.isEnabled) {
      console.warn('SwPush not enabled — service worker not running or not a production build.');
      return;
    }
 
    // Check if browser already has an existing subscription
    this.swPush.subscription.pipe(take(1)).subscribe({
      next: (existingSub) => {
        if (existingSub) {
          // Browser already subscribed — re-post to backend to re-sync after restart
          console.log('🔄 Existing push subscription found — re-syncing with backend...');
          this.postSubscriptionToBackend(existingSub);
        } else {
          // No existing subscription — request a new one
          console.log('📋 No existing subscription — requesting new one...');
          this.requestNewSubscription();
        }
      },
      error: (err) => console.error('Failed to check existing subscription:', err)
    });
  }
 
  private requestNewSubscription(): void {
    this.swPush.requestSubscription({ serverPublicKey: this.VAPID_PUBLIC_KEY })
      .then((newSub: PushSubscription) => {
        console.log('✅ New push subscription obtained');
        this.postSubscriptionToBackend(newSub);
      })
      .catch((err) => {
        console.error('❌ Push subscription request failed:', err);
      });
  }
 
  private postSubscriptionToBackend(subscription: PushSubscription): void {
    this.http.post(`${this.BACKEND_URL}/api/subscribe`, subscription).subscribe({
      next: () => console.log('✅ Push subscription synced with backend successfully'),
      error: (err) => console.error('❌ Failed to sync subscription with backend:', err)
    });
  }
}
 








