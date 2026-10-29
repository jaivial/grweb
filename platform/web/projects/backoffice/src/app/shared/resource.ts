import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** REST collection under /api/admin/competiciones/{cid}/… with list, create, update, delete and reorder. */
export class Resource<T extends { id: string }> {
  readonly items = signal<T[] | null>(null);
  readonly error = signal('');
  private base = '';

  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
  ) {}

  at(cid: string): this {
    this.base = `/api/admin/competiciones/${cid}${this.path}`;
    return this;
  }

  async load(): Promise<void> {
    this.error.set('');
    try {
      this.items.set(await firstValueFrom(this.http.get<T[]>(this.base)));
    } catch {
      this.error.set('No se pudo cargar la lista.');
      this.items.set([]);
    }
  }

  async create(body: unknown): Promise<T> {
    const r = await firstValueFrom(this.http.post<T>(this.base, body));
    this.items.update((l) => [...(l ?? []), r]);
    return r;
  }

  async update(id: string, body: unknown): Promise<T> {
    const r = await firstValueFrom(this.http.put<T>(`${this.base}/${id}`, body));
    this.items.update((l) => (l ?? []).map((x) => (x.id === id ? r : x)));
    return r;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/${id}`));
    this.items.update((l) => (l ?? []).filter((x) => x.id !== id));
  }

  async reorder(ids: string[]): Promise<void> {
    const byId = new Map((this.items() ?? []).map((x) => [x.id, x]));
    this.items.set(ids.map((id) => byId.get(id)!).filter(Boolean));
    await firstValueFrom(this.http.put(`${this.base}/orden`, { ids }));
  }
}
