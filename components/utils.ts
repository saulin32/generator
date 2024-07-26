import { capitalize, lowerCase } from "lodash";

export function splitOnFirst(string, separator) {
  if (!(typeof string === "string" && typeof separator === "string")) {
    throw new TypeError("Expected the arguments to be of type `string`");
  }

  if (string === "" || separator === "") {
    return [];
  }

  const separatorIndex = string.indexOf(separator);

  if (separatorIndex === -1) {
    return [];
  }

  return [string.slice(0, separatorIndex), string.slice(separatorIndex + separator.length)];
}

export function parseScheme(scheme) {
  return scheme.map((field) => {
    let acc = { ...field };

    if (!acc.options) acc.options = {};

    acc.options.Type = field.type;
    acc.options.Name = field.name;

    for (let key in field.options) {
      acc.options[
        lowerCase(key)
          .split(" ")
          .map((i) => capitalize(i))
          .join("")
      ] = field.options?.[key];
    }

    if (field.options?.apiParams?.length > 0) {
      acc.options.ApiParams = Object.fromEntries(field.options?.apiParams.map((el) => splitOnFirst(el, "=")));
    }
    if (field.options?.searchParams?.length > 0) {
      acc.options.SearchParams = Object.fromEntries(field.options?.searchParams.map((el) => splitOnFirst(el, "=")));
    }
    return acc;
  });
}

export function getProperty(labels, value) {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!labels) return Object.values(value).join(" ");
  labels = labels.split(",").map((el) => el.trim());
  return labels.map((label) => value?.[label]).join(" ");
}

export function getReferenceData(referenceId, params) {
  return window.axiosCache
    .get(window.localhost16 + `forms_generator/api/reference/${referenceId}`, {
      params,
    })
    .then((t) => t.data);
}
