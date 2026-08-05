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

  // ✅ Must match the threshold in AlertsPanel
  private readonly SITE_LAT = 48.208492;
  private readonly SITE_LNG = 16.373118;
  private readonly GEOFENCE_RADIUS = 250;

  constructor(private locationService: LocationService) {}

  ngOnInit(): void {
    this.initMap();
    this.subscribeToLocations();
  }

  private initMap(): void {
    this.map = L.map(this.mapContainer.nativeElement).setView([this.SITE_LAT, this.SITE_LNG], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // ✅ Draw the geofence boundary circle on the map so it's visible
    L.circle([this.SITE_LAT, this.SITE_LNG], {
      radius: this.GEOFENCE_RADIUS,
      color: '#e74c3c',
      fillColor: '#e74c3c',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6 4'
    }).addTo(this.map).bindPopup('Geofence boundary (250m)');
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
    if (this.locationSub) this.locationSub.unsubscribe();
  }
}