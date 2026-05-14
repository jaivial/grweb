export type LiftType = 'Squat' | 'Bench' | 'Deadlift';

export interface LiftEntry {
  id: number;
  athleteId: number;
  liftType: LiftType;
  attemptNumber: number;
  weight: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckinStatus {
  athlete: {
    id: number;
    firstName: string;
    surname: string;
    email: string;
    weightCategory: string;
    sex: string;
    club: string | null;
    coach: string | null;
  };
  inscriptionConfirmed: boolean;
  paymentCompleted: boolean;
  canSetOpeners: boolean;
  checkinAt: string | null;
}

export interface SetOpenersRequest {
  squatWeight: number;
  benchWeight: number;
  deadliftWeight: number;
}

export interface UpdateAttemptRequest {
  weight: number;
}
