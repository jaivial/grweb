import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, Bell, Calendar, CalendarDays, Camera, Car, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronsUpDown, CircleAlert, CircleCheck, CircleHelp, CircleX, Clock, DoorOpen, Download, Eye, ExternalLink, Gift, Globe,
  GripVertical, History, House, Info, KeyRound, LayoutTemplate, LoaderCircle, Lock, LogOut, Mail, MapPin, Menu, Minus, PanelLeft, Pencil, Plane, Plug,
  Plus, Pause, Play, Monitor, Copy, Maximize2, Radio, RefreshCw, Scale, ScanLine, Search, Send, Settings, Shield, ShieldAlert, Smartphone, Sparkles, Star, Ticket, Trash2, Undo2, CalendarPlus,
  TrainFront, TriangleAlert, Trophy, User, UserPlus, Users, WifiOff, X, Zap, Link, CreditCard, Bus, Bike, SquareParking, Accessibility, type IconNode,
} from 'lucide';

/** Instagram glyph (lucide 1.x dropped brand icons; same geometry as the old lucide «instagram»). */
const Instagram: IconNode = [
  ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5' }],
  ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' }],
  ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5' }],
];

/** Icons available in the platform (lucide, stroke 2 — Figma «Icon» / «BO / Nav icon»). */
export const GR_ICONS = {
  activity: Activity, 'arrow-down': ArrowDown, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, 'arrow-up': ArrowUp, award: Award, bell: Bell,
  calendar: Calendar, 'calendar-days': CalendarDays, camera: Camera, car: Car, check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, 'chevrons-up-down': ChevronsUpDown, 'circle-alert': CircleAlert, 'circle-check': CircleCheck,
  help: CircleHelp, 'circle-x': CircleX, clock: Clock, download: Download, 'external-link': ExternalLink, gift: Gift,
  globe: Globe, history: History, home: House, info: Info, key: KeyRound, layout: LayoutTemplate, loader: LoaderCircle,
  lock: Lock, 'log-out': LogOut, mail: Mail, 'map-pin': MapPin, menu: Menu, minus: Minus, 'panel-left': PanelLeft,
  plane: Plane, plug: Plug, plus: Plus, radio: Radio, refresh: RefreshCw, scale: Scale, scan: ScanLine, search: Search, send: Send,
  settings: Settings, shield: Shield, 'shield-alert': ShieldAlert, smartphone: Smartphone, sparkles: Sparkles,
  ticket: Ticket, train: TrainFront, 'triangle-alert': TriangleAlert, trophy: Trophy, user: User, 'user-plus': UserPlus, users: Users,
  'wifi-off': WifiOff, x: X, zap: Zap, door: DoorOpen, eye: Eye, grip: GripVertical, pencil: Pencil, star: Star, trash: Trash2, undo: Undo2,
  'calendar-plus': CalendarPlus, pause: Pause, play: Play, monitor: Monitor, copy: Copy, maximize: Maximize2,
  instagram: Instagram, link: Link, 'credit-card': CreditCard, bus: Bus, bike: Bike, parking: SquareParking, accessibility: Accessibility,
} satisfies Record<string, IconNode>;

export type GrIconName = keyof typeof GR_ICONS;

/** Inline SVG icon. Decorative by default (aria-hidden); pass `label` for meaningful icons. */
@Component({
  selector: 'gr-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center', '[attr.aria-hidden]': 'label() ? null : "true"', '[attr.role]': 'label() ? "img" : null', '[attr.aria-label]': 'label()' },
  template: `<svg xmlns="http://www.w3.org/2000/svg" [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" [attr.stroke-width]="stroke()" stroke-linecap="round" stroke-linejoin="round" [class.animate-spin]="spin()">
    @for (el of nodes(); track $index) {
      @switch (el[0]) {
        @case ('path') { <path [attr.d]="el[1]['d']" /> }
        @case ('circle') { <circle [attr.cx]="el[1]['cx']" [attr.cy]="el[1]['cy']" [attr.r]="el[1]['r']" /> }
        @case ('rect') { <rect [attr.x]="el[1]['x']" [attr.y]="el[1]['y']" [attr.width]="el[1]['width']" [attr.height]="el[1]['height']" [attr.rx]="el[1]['rx']" [attr.ry]="el[1]['ry']" /> }
        @case ('line') { <line [attr.x1]="el[1]['x1']" [attr.y1]="el[1]['y1']" [attr.x2]="el[1]['x2']" [attr.y2]="el[1]['y2']" /> }
        @case ('polyline') { <polyline [attr.points]="el[1]['points']" /> }
        @case ('polygon') { <polygon [attr.points]="el[1]['points']" /> }
        @case ('ellipse') { <ellipse [attr.cx]="el[1]['cx']" [attr.cy]="el[1]['cy']" [attr.rx]="el[1]['rx']" [attr.ry]="el[1]['ry']" /> }
      }
    }
  </svg>`,
})
export class GrIcon {
  readonly name = input.required<GrIconName>();
  readonly size = input(20);
  readonly stroke = input(2);
  readonly spin = input(false);
  readonly label = input<string | null>(null);
  protected readonly nodes = computed(() => GR_ICONS[this.name()] as unknown as [string, Record<string, string>][]);
}
