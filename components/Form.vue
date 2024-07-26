<script setup>
import { RadioGroup, Radio, theme, Button, Stack, DataTable } from "bms-ui-lib";
import dayjs from "dayjs";
import { find } from "lodash";
import { ref, computed, onMounted, isRef, watch } from "vue";
import CustomParseFormat from "dayjs/plugin/customParseFormat";
import isBetween from "dayjs/plugin/isBetween";
import { components, colSpans } from "./data";
import { randomID } from "@/modules/SickList/utils";
import RenderTemplate from "./RenderTemplate.vue";
import uncachedApi from "./uncached-api";
import { createTailwindcss } from "@mhsdesign/jit-browser-tailwindcss";
import { parseScheme, getProperty, getReferenceData } from "./utils";

dayjs.extend(CustomParseFormat);
dayjs.extend(isBetween);

let tailwind = createTailwindcss();

let props = defineProps({
  data: null,
  schema: Array,
  middleware: {
    type: Array,
    default: [],
  },
});

defineEmits(["submit"]);

let defaultInfo = defineModel("defaultInfo", {
  local: true,
  default: {},
});
function replaceSymbols(str) {
  let markers = [...new Set(str.match(/(\{{.*?\}})/g))];
  markers?.forEach((item) => {
    let key = find(props.schema, { Field: item.replace("{{", "").replace("}}", "") }).Key;
    str = str.replaceAll(item, `defaultInfo.value['${key}']`);
  });
  return str.replaceAll("&&", "__AND__").replaceAll("&", "data").replaceAll("__AND__", "&&").replaceAll("$", "props.data.");
}

props.schema.forEach((element) => {
  switch (element.Type) {
    case "Checkbox":
    case "Switch":
      defaultInfo.value[element.Key] = false;
      break;
    case "Table":
      element.Columns = parseScheme(element.Columns).map((i) => {
        i.options.Key = element.Key;
        return i;
      });

      defaultInfo.value[element.Key] =
        element.StaticValues?.map((i) => {
          i.id = randomID();
          return i;
        }) || [];
      break;
    case "Dropdown":
      if (element.Multiple) {
        defaultInfo.value[element.Key] = [];
      } else {
        defaultInfo.value[element.Key] = "";
      }
      break;
    case "Html":
      defaultInfo.value[element.Key] = {};
      break;
    default:
      defaultInfo.value[element.Key] = "";
  }
});

function evaluate(property) {
  if (typeof property !== "string") return property;
  try {
    property = eval(replaceSymbols(property));
  } catch (error) {
    if (property.includes("$") || property.includes("&")) {
      property = null;
    }
  }
  return property;
}

function compute(property) {
  if (typeof property !== "string") return property;
  return computed({
    get() {
      try {
        return eval(replaceSymbols(property));
      } catch {
        return property;
      }
    },
    set() {},
  });
}

async function setValues(element, data = [], searched = false) {
  let value = element.Value;
  try {
    value = eval(replaceSymbols(element.Value));
  } catch (error) {
    if (value.includes("$") || value.includes("&")) {
      value = null;
    }
  }
  switch (element.Type) {
    case "Autocomplete":
    case "Text":
    case "Reminder":
    case "Tree":
    case "Date":
    case "Time":
      defaultInfo.value[element.Key] = value;
      break;
    case "Float":
      defaultInfo.value[element.Key] = parseInt(value);
      break;
    case "Dropdown":
      // if (element.LabelProperty || typeof data?.[0] === "string") {
      //   element.StaticValues = data;
      // }

      let labels = element?.LabelProperty.split(",").map((el) => el.trim());

      if (labels[0]) {
        element.StaticValues = data.map((i) => {
          i.label = labels.map((label) => i?.[label]).join(" ");
          return i;
        });
      }

      if (value && !searched) {
        if (typeof value === "object") {
          value.label = labels?.map((label) => value?.[label]).join(" ");
        }
        defaultInfo.value[element.Key] = value;
      }

      // if (value && !searched) {
      //   defaultInfo.value[element.Key] = value;
      // }
      break;
    case "Table":
      defaultInfo.value[element.Key] = data;
      element.StaticValues = data;
      break;
  }
}

async function setValueForField(element) {
  if (element.Type === "Table") {
    element.Columns.forEach((col) => setValueForField(col.options));
  }

  if (element.Computed) return;

  if (element.Value && !element.ApiUrl) {
    setValues(element);
  }

  if (element.Reference) {
    return setReferenceValues(element);
  }

  if (element.ApiUrl) {
    await callApi(element, element.ApiUrl, element?.ApiParams, "", true);
  }
}

async function callApi(element, url, params, query = "", callAnyway = false) {
  if (query.length || callAnyway) {
    let method = "get";
    const _params = {};
    let instance = uncachedApi.includes(url) ? window.axios : window.axiosCache;
    for (let [key, value] of Object.entries(params)) {
      if (key === "_method") {
        method = value?.toLowerCase();
        continue;
      }
      if (key === "_no_cache") {
        instance = window.axios;
        continue;
      }

      let param = evaluate(value.replaceAll("_value_", query));
      _params[key] = param;
    }

    let data = await instance[method](window.localhost + url, method !== "get" ? { ..._params } : { params: _params }).then(
      (res) => res.data?.Body || res.data
    );

    if (data === null || !data.length) return;

    setValues(element, data, !!query.length);
  }
}

let form = ref();

defineExpose({
  defaultInfo,
  form,
});

await Promise.all(props.schema.map((element) => setValueForField(element)));

for (let fn of props.middleware) {
  await fn?.();
}

props.schema.forEach((element) => {
  if (element.Hidden) {
    element.Hidden = compute(element.Hidden);
  }
  if (element.Computed) {
    defaultInfo.value[element.Key] = compute(element.Value);
  }
  if (element.Min && element.Type === "Date") {
    element.Min = compute(element.Min);
  }
  if (element.Max && element.Type === "Date") {
    element.Max = compute(element.Max);
  }
});

watch(
  () => props.data.dataForComp,
  async () => {
    for (let element of props.schema) {
      if (element.Disabled && element.Value.includes?.("$dataForComp")) {
        await setValueForField(element);
      }
    }
  },
  {
    immediate: true,
  }
);

async function setReferenceValues(element, query = "", searched = false) {
  let data = await getReferenceData(element.Reference, {
    query,
    patientId: props.data.patient.Id,
    lpuId: props.data.user.LpuId,
    divisionId: props.data.user.FrmoId,
    employeePostId: props.data.employeePostId,
  });
  setValues(element, data, searched);
}

function search(item, query) {
  if (item.Reference) {
    setReferenceValues(item, query, true);
  } else if (item.SearchUrl) {
    callApi(item, item.SearchUrl, item.SearchParams, query);
  }
}

onMounted(async () => {
  let templates = "";
  props.schema.forEach((item) => {
    if (item.Type === "Html") {
      templates += item.Template;
    }
  });
  const css = await tailwind.generateStylesFromContent(
    `
      /* without the "@tailwind base;" */
      @tailwind components;
      @tailwind utilities;
  `,
    [templates]
  );
  document.head.insertAdjacentHTML("afterbegin", `<style data-tailwindcss>${css}</style>`);
});
</script>

<template>
  <form ref="form" @submit.prevent="$emit('submit', $event)" class="gap-4 grid grid-cols-12">
    <template v-for="(item, index) in schema" :key="item.Key">
      <div :class="colSpans[item.ColSpan]">
        <Component
          v-if="
            item.Type !== 'Radio' &&
            item.Type !== 'Header' &&
            item.Type !== 'Table' &&
            item.Type !== 'Paragraph' &&
            item.Type !== 'Html' &&
            !item.Hidden
          "
          :required="item.Validate?.includes('required')"
          :description="item.Description"
          :label="item.Name"
          :placeholder="item.Name"
          :is="item.Multiple && item.Type === 'Dropdown' ? components['MultiDropdown'] : components[item.Type]"
          :data="item.StaticValues"
          :disabled="item.Disabled"
          :mask="item.Format"
          :auto-resize="['Reminder', 'Autocomplete'].includes(item.Type)"
          :with-hours="item.WithHours"
          :searchable="item.Searchable"
          :append="item.Append"
          :min="item.Min"
          :max="item.Max"
          :limit="item.Limit || undefined"
          @query="search(item, $event)"
          v-model="defaultInfo[item.Key]"
          append-parents-values
          :editable="item.Editable"
          clearable
        />
        <h3 v-if="item.Type === 'Header'" class="text-2xl font-semi-bold border-b border-gray-300">
          {{ item.Name }}
        </h3>

        <p
          v-if="item.Type === 'Paragraph'"
          class="text-2xl font-semibold border-gray-300"
          :class="`text-${item.TextAlignment}`"
          :style="{
            fontSize: item.FontSize,
            color: item.Color,
            fontWeight: item.FontWeight,
          }"
        >
          {{ item.Name }}
        </p>

        <div v-if="item.Type === 'Table'">
          <div class="flex mb-2">
            <p class="w-full text-center text-lg">{{ item.Name }}</p>
            <div class="col-span-12 ml-auto" v-if="item.CanAdd">
              <Button
                primary
                class=""
                @click="
                  defaultInfo[item.Key] = [
                    ...defaultInfo[item.Key],
                    {
                      id: randomID(),
                      Editable: true,
                      ...item.Columns.reduce((acc, i) => {
                        acc[i.accessor] = '';
                        return acc;
                      }, {}),
                    },
                  ]
                "
                >+</Button
              >
            </div>
          </div>
          <DataTable
            :records="defaultInfo[item.Key]"
            :columns="item.Columns"
            with-border
            with-column-borders
            striped
            highlight-on-hover
            :height="!defaultInfo[item.Key]?.length ? '300px' : undefined"
            shadow="sm"
            border-radius="sm"
            actionWidth="120px"
            :actions="[
              {
                name: '',
                icon: 'pen',
                onClick: ({ record }) => {
                  record.Editable ? (record.Editable = false) : (record.Editable = true);
                },
                color: theme.colors.orange[2],
                tooltip: 'Редактировать',
                tooltipPlacement: 'top',
              },
              {
                hidden: !item.CanAdd,
                name: '',
                icon: 'trash',
                onClick: ({ record }) => {
                  defaultInfo[item.Key] = defaultInfo[item.Key].filter((i) => i.id !== record.id);
                },
                color: theme.colors.red[1],
                tooltip: 'Удалить',
                tooltipPlacement: 'top',
              },
            ]"
          >
            <template v-for="col in item.Columns" #[`cell(${col.accessor})`]="{ value, record, index }">
              <div v-if="record.Editable">
                <Component
                  v-if="col.type !== 'Html'"
                  :is="col.options.Multiple ? components['MultiDropdown'] : components[col.type]"
                  :placeholder="col.name"
                  v-model="defaultInfo[item.Key][index][col.accessor]"
                  :data="col.options?.StaticValues"
                  :mask="col.options.Format"
                  :auto-resize="['Reminder', 'Autocomplete'].includes(col.type)"
                  :with-hours="col.options.WithHours"
                  :disabled="col.options.Disabled"
                  :searchable="col.options.Searchable"
                  :append="col.options.Append"
                  :min="col.options.Min"
                  :max="col.options.Max"
                  :limit="item.Limit || undefined"
                  :option-attribute="item.LabelProperty ? item.LabelProperty.split(',') : undefined"
                  append-parents-values
                  :editable="col.options.Editable"
                  @query="search(item, $event)"
                  clearable
                />
                <RenderTemplate
                  :template="col.options?.Template"
                  :setup="col.options?.Setup"
                  :data="defaultInfo"
                  :ctx="data"
                  v-model="defaultInfo[item.Key][index][col.accessor]"
                  v-else
                />
              </div>
              <span v-else>{{ getProperty(col.options?.LabelProperty, value) }}</span>
            </template>

            <template #action(1)="{ record }">
              <Button
                v-if="record.Editable"
                subtle
                @click="record.Editable = false"
                class="!text-green-500 hover:!bg-emerald-100 rounded-full"
                prepend-icon="check"
              ></Button>
            </template>
            <template #action(2)="{ record }">
              <div v-if="record.Editable"></div>
            </template>
          </DataTable>
        </div>
        <RadioGroup :label="item.Name" v-model="defaultInfo[item.Key]" v-if="item.Type === 'Radio'">
          <div v-for="radio in item.StaticValues">
            <Radio :value="radio" :label="radio" />
          </div>
        </RadioGroup>
        <RenderTemplate
          v-if="item.Type === 'Html'"
          :template="item.Template"
          :setup="item.Setup"
          :data="defaultInfo"
          :ctx="{ ...data, schema }"
          v-model="defaultInfo[item.Key]"
        ></RenderTemplate>
      </div>
    </template>
  </form>
</template>
