import React from "react";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import { AppSettings, getWeekendDays } from "../../services/config";
import "./MenuItemsToggle.css";

// Listed Monday-first; values are JS getDay() numbers.
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

interface WeekendDaysCardProps {
  formState: AppSettings;
  setFormState: React.Dispatch<React.SetStateAction<AppSettings>>;
}

/** Which days are off; drives "since last workday" on the Workday page. */
export const WeekendDaysCard: React.FC<WeekendDaysCardProps> = ({ formState, setFormState }) => {
  const weekend = getWeekendDays(formState);

  const toggle = (day: number, off: boolean) => {
    setFormState((prev) => {
      const current = getWeekendDays(prev);
      const next = off ? [...current, day] : current.filter((d) => d !== day);
      return { ...prev, weekendDays: [...new Set(next)].sort() };
    });
  };

  return (
    <Card className="mb-3">
      <Card.Body>
        <h6 style={{ marginBottom: 4 }}>Weekend</h6>
        <p className="text-secondary-custom" style={{ fontSize: "0.75rem", marginBottom: 12 }}>
          Days off. Workday's "Done since last workday" skips these.
        </p>
        <div className="menu-toggle-list">
          {DAYS.map((d) => (
            <label key={d.value} className="menu-toggle-row" htmlFor={`weekend-${d.value}`}>
              <span>{d.label}</span>
              <Form.Check
                type="switch"
                id={`weekend-${d.value}`}
                checked={weekend.includes(d.value)}
                onChange={(e) => toggle(d.value, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </Card.Body>
    </Card>
  );
};
