import { PDFDocument } from "pdf-lib";

export type FillableField = {
  name: string;
  type: "text" | "checkbox" | "dropdown" | "option" | "unknown";
  value: string;
  options?: string[];
};

export async function listFormFields(source: Uint8Array): Promise<FillableField[]> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const form = pdf.getForm();
  const fields = form.getFields();

  return fields.map((field) => {
    const name = field.getName();
    const ctor = field.constructor.name;

    try {
      if (ctor.includes("Text")) {
        const textField = form.getTextField(name);
        return {
          name,
          type: "text" as const,
          value: textField.getText() ?? "",
        };
      }
      if (ctor.includes("CheckBox")) {
        const box = form.getCheckBox(name);
        return {
          name,
          type: "checkbox" as const,
          value: box.isChecked() ? "true" : "false",
        };
      }
      if (ctor.includes("Dropdown")) {
        const dropdown = form.getDropdown(name);
        return {
          name,
          type: "dropdown" as const,
          value: dropdown.getSelected()?.[0] ?? "",
          options: dropdown.getOptions(),
        };
      }
      if (ctor.includes("RadioGroup") || ctor.includes("OptionList")) {
        return {
          name,
          type: "option" as const,
          value: "",
        };
      }
    } catch {
      // fall through
    }

    return { name, type: "unknown" as const, value: "" };
  });
}

export async function fillFormFields(
  source: Uint8Array,
  values: Record<string, string>,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const form = pdf.getForm();

  for (const [name, value] of Object.entries(values)) {
    try {
      const field = form.getField(name);
      const ctor = field.constructor.name;

      if (ctor.includes("Text")) {
        form.getTextField(name).setText(value);
      } else if (ctor.includes("CheckBox")) {
        const box = form.getCheckBox(name);
        if (value === "true" || value === "1" || value.toLowerCase() === "yes") {
          box.check();
        } else {
          box.uncheck();
        }
      } else if (ctor.includes("Dropdown")) {
        if (value) form.getDropdown(name).select(value);
      }
    } catch {
      // skip incompatible fields
    }
  }

  form.flatten();
  return pdf.save();
}
