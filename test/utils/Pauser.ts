import { BehaviorSubject, Observable } from "rxjs";

export function pause<T>(pauser: BehaviorSubject<boolean>) {
  return (source: Observable<T>) =>
    new Observable<T>(observer => {
      let buffer: any[] = [];

      const sourceSubscription = source.subscribe({
        next(value) {
          if (!pauser.value) {
            observer.next(value);
          } else {
            buffer.push(value);
          }
        },
        error(err) {
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      const bufferSubscription = pauser.subscribe(pause => {
        if (!pause) {
          buffer.forEach(value => observer.next(value));
          buffer = [];
        }
      });

      return () => {
        sourceSubscription.unsubscribe();
        bufferSubscription.unsubscribe();
      };
    });
}
