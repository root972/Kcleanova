import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Form } from './form/form';
import { WorkerMap } from './components/worker-map/worker-map';
import { AlertsPanel } from './components/alerts-panel/alerts-panel';

@NgModule({
  declarations: [
    App,
    Form,
    WorkerMap,
    AlertsPanel
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient()
  ],
  bootstrap: [App]
})
export class AppModule {}