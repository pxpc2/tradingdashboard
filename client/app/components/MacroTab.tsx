"use client";

import CalendarFixedHeight from "./CalendarFixedHeight";

type Props = {
  selectedDate: string;
};

export default function MacroTab({ selectedDate }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 space-y-3">
      <CalendarFixedHeight selectedDate={selectedDate} />
    </div>
  );
}
