import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { LocationService, LocationUpdate } from '../../services/location.service';

@Component({
  selector: 'app-worker-map',
  standalone: false,
  templateUrl: './worker-map.html',
  styleUrl: './worker-map.css',
})
export class WorkerMap implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  private map!: L.Map;
  private workerMarkers = new Map<number, L.Marker>();
  private locationSub!: Subscription;
  isLive = false;

  constructor(private locationService: LocationService) {}

  ngOnInit(): void {
    this.initMap();
    this.subscribeToLocations();
  }

  private initMap(): void {
    // Initialize Leaflet map centered at Stephansplatz site
    this.map = L.map(this.mapContainer.nativeElement).setView([48.208492, 16.373118], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);
  }

  private subscribeToLocations(): void {
    this.locationSub = this.locationService.getLocationUpdates().subscribe(
      (data: LocationUpdate) => {
        this.isLive = true;
        this.updateMarker(data.workerId, data.latitude, data.longitude, data.timestamp);
      }
    );
  }

  private updateMarker(workerId: number, lat: number, lng: number, timestamp: string): void {
    const latLng = L.latLng(lat, lng);
    const timeStr = new Date(timestamp).toLocaleTimeString();
    const popupContent = `<b>Worker #${workerId}</b><br>Updated: ${timeStr}`;

    // 🎯 Pan map to keep worker inside viewable screen
    this.map.panTo(latLng);

    if (this.workerMarkers.has(workerId)) {
      const marker = this.workerMarkers.get(workerId)!;
      marker.setLatLng(latLng);
      marker.getPopup()?.setContent(popupContent);
    } else {
      const marker = L.marker(latLng).addTo(this.map).bindPopup(popupContent);
      this.workerMarkers.set(workerId, marker);
    }
  }

  ngOnDestroy(): void {
    if (this.locationSub) {
      this.locationSub.unsubscribe();
    }
  }
}