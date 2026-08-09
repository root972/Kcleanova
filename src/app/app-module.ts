import { NgModule, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { Form } from './form/form';
import { WorkerMap } from './components/worker-map/worker-map';
import { AlertsPanel } from './components/alerts-panel/alerts-panel';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { ForgotPassword } from './pages/forgot-password';
import { ResetPassword } from './pages/reset-password';

// Interceptor
import { jwtInterceptor } from './interceptors/jwt-interceptor';

@NgModule({
  declarations: [App, Form, WorkerMap, AlertsPanel, Login, Register, ForgotPassword, ResetPassword],
  imports: [BrowserModule, FormsModule, AppRoutingModule],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
  bootstrap: [App],
})
export class AppModule {}