<script setup>
import { ref, defineAsyncComponent, onBeforeUnmount, onMounted, computed, getCurrentInstance, onUnmounted } from "vue";
import { Button, Loader, Skeleton } from "bms-ui-lib";
import { useStore } from "vuex";
import { colSpans } from "./components/data";
import Form from "./components/Form.vue";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import printJS from "print-js";
import { notifyError, notifySuccess } from "@/assets/js/methods.js";
import { _registerSpecifyFederationDataSourceSettingsPage } from "@devexpress/analytics-core/analytics-wizard";

dayjs.extend(customParseFormat);

const props = defineProps({
  data: Object,
  middleware: {
    type: Array,
    default: [],
  },
  getInitialData: {
    type: Boolean,
    default: true,
  },
  autoSave: {
    type: Boolean,
    default: false,
  },
});

let emit = defineEmits(["save", "created"]);
let schema = ref(null);

let form = ref();
let defaultInfo = ref({});

let loading = ref(false);

let store = useStore();

let patient = store.getters.patient;
let patientId = store.getters.patient.Id;
let employeePostId = computed(() => store.getters.employeePostId);
let user = computed(() => store.getters.user);

function getSchema() {
  window.axios
    .get(window.localhost + `refs/FormSchema`, {
      params: {
        FormId: props.data.formId,
      },
    })
    .then((response) => {
      let res = JSON.parse(response.data.Body[0].Scheme);
      if (typeof res === "string") res = JSON.parse(res);
      if (!res) {
        schema.value = [];
        return;
      }
      schema.value = Object.entries(res).map(([key, value]) => {
        res[key].Key = key;
        return res[key];
      });
    })
    .catch((error) => console.error(error));
}

async function getDefaultInfo() {
  if (props.data.FormDatasId) {
    let res = await window.axios
      .get(window.localhost + `exam_web/FormDatas?Id=${props.data.FormDatasId}`)
      .then((res) => res.data)
      .catch((error) => console.error(error));

    if (res?.Body?.[0]?.FormData) {
      defaultInfo.value = res.Body[0].FormData;
    }
  } else {
    emit("created");
  }
}

async function saveForm(opts = {}, withNotify = true) {
  loading.value = true;
  let method = props.data?.FormDatasId ? "put" : "post";
  let url = props.data?.FormDatasId ? `exam_web/FormDatas?Id=${props.data?.FormDatasId}` : "exam_web/FormDatas";
  return window
    .axios({
      url: window.localhost + url,
      method,
      data: {
        FormData: defaultInfo.value,
        FormId: props.data.formId,
        PatientId: patientId,
        SourceId: props.data?.sourceId,
        VisitDate: props.data?.hospVisit?.Date
          ? dayjs(props.data?.hospVisit?.Date, ["DD.MM.YYYY HH:mm", "YYYY-MM-DD HH:mm"]).format("YYYY-MM-DD HH:mm")
          : null,
        HospitalHistoryId: props.data?.hospVisit?.HospitalHistoryId,
        NullVisit: props.data.dataForComp?.NullVisit,
        Comment: "",
        Deleted: "false",
        ...opts.data,
      },
    })
    .then((res) => {
      loading.value = false;
      emit("save", {
        Id: res.data.Body[0]?.Id,
      });
      if (withNotify) {
        notifySuccess("Протокол успешно сохранен!", 1000);
      }
    });
}

function printForm(opts = {}) {
  window.axios.get(window.localhost + `refs/ProtocolPrintId?Id=${props.data.formId}`).then(async (response) => {
    let printFormId = response.data.Body[0].PrintFormId;
    if (printFormId) {
      let data = await window.axios
        .get(window.localhost + `forms_generator/api/print-forms/${printFormId}`, {
          params: opts.params,
        })
        .then((t) => {
          printJS({ printable: t.data, type: "raw-html" });
        });
    } else {
      notifyError("Под этот протокол ещё не создана печатная форма!", 3000);
    }
  });
}

function printForms(formsId = [], sourceId = null) {
  Promise.all(
    formsId.map(async (x) => ({
      FormId: x,
      PrintId: await window.axios.get(window.localhost + `refs/ProtocolPrintId?Id=${x}`).then((resp) => resp.data.Body[0].PrintFormId),
    }))
  ).then((printForms) => {
    let prints = printForms.filter((x) => x.PrintId);
    if (prints.length < printForms.length) notifyError("Под один или несколько протоколов ещё не созданы печатные формы!", 3000);
    if (prints.length) {
      Promise.all(
        prints.map(async (x) => {
          return (
            await window.axios.get(window.localhost + `forms_generator/api/print-forms/${x.PrintId}`, {
              params: {
                FormId: x.FormId,
                SourceId: sourceId,
              },
            })
          ).data;
        })
      ).then((data) => {
        printJS({ printable: data.map((x) => '<div class="break-before-page">' + x + "</div>").join(""), type: "raw-html" });
      });
    } else notifyError("Под эти протокола ещё не созданы печатные формы!", 3000);
  });
}

function saveBeforeMounted() {
  if (props.autoSave && !props.data?.FormDatasId) {
    saveForm(undefined, false);
  }
}

defineExpose({ saveForm, printForm, form, loading, defaultInfo, getDefaultInfo, schema, printForms });

onMounted(async () => {
  getSchema();
  for (let fn of props.middleware) {
    await fn?.();
  }
});

onBeforeUnmount(() => {
  if (props.autoSave) {
    if (form.value?.form?.reportValidity()) {
      saveForm(undefined, true);
    } else {
      notifyError("Протокол не был сохранен!", 3000, "Ошибка валидации!");
    }
  }
});
</script>

<template>
  <div v-if="schema">
    <Suspense>
      <Form
        :data="{
          ...data,
          patient,
          employeePostId,
          user,
        }"
        :middleware="getInitialData ? [getDefaultInfo, saveBeforeMounted] : []"
        v-model:default-info="defaultInfo"
        ref="form"
        @submit.prevent="saveForm"
        :schema="schema"
      >
      </Form>
      <template #fallback>
        <div class="gap-4 grid grid-cols-12 p-5">
          <div v-for="item in schema" :class="[colSpans[item.ColSpan]]">
            <template v-if="item.Type === 'Checkbox'">
              <div class="w-32 flex gap-2 items-center">
                <Skeleton class="rounded h-4 !w-4" />
                <Skeleton class="rounded h-4 flex-1" />
              </div>
            </template>
            <template v-else-if="item.Type === 'Paragraph'">
              <Skeleton class="h-2 rounded" :style="{ maxWidth: `${Math.random() * 1000 + 100}px` }" />
            </template>
            <template v-else-if="item.Type === 'Header'">
              <div class="border-b pb-2">
                <Skeleton class="h-4 rounded" :style="{ maxWidth: `350px` }" />
              </div>
            </template>
            <Skeleton v-else class="rounded h-8" />
          </div>
        </div>
      </template>
    </Suspense>
  </div>
</template>
