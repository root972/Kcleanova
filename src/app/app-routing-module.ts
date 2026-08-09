import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Components
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { WorkerMap } from './components/worker-map/worker-map';
import { Form } from './form/form';

// Guards
import { authGuard, roleGuard } from './guards/guards';

const routes: Routes = [
  // Default route
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Public auth routes
  { path: 'login', component: Login },
  { path: 'register', component: Register },

  // Protected: Any logged-in user (WORKER or ADMIN)
  { 
    path: 'form', 
    component: Form, 
    canActivate: [authGuard] 
  },

  // Protected: ADMIN only
  { 
    path: 'map', 
    component: WorkerMap, 
    canActivate: [authGuard, roleGuard(['ADMIN'])] 
  },

  // Fallback
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }