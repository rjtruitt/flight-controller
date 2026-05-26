/** Strategy for computing when a session limit resets. */
export interface IResetCalculator {
  calculateResetTime(hitTime: Date): Date;
}

/** Resets at midnight local time. */
export class DailyResetCalculator implements IResetCalculator {
  calculateResetTime(_hitTime: Date): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}

/** Resets on the first of the next month. */
export class MonthlyResetCalculator implements IResetCalculator {
  calculateResetTime(_hitTime: Date): Date {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);
    return nextMonth;
  }
}

/** Delegates reset calculation to a user-supplied function. */
export class CustomResetCalculator implements IResetCalculator {
  constructor(private readonly calculator: (hitTime: Date) => Date) {}

  calculateResetTime(hitTime: Date): Date {
    return this.calculator(hitTime);
  }
}
