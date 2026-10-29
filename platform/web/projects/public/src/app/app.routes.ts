import type { Routes } from '@angular/router';
import { HomePage, NotFoundPage } from './home/home';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: '**', component: NotFoundPage },
];
