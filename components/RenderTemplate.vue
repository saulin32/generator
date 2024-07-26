<script setup lang="ts">
import { defineComponent, ref, computed, watch, reactive, watchEffect, onMounted } from "vue";
import {
  Button,
  Checkbox,
  DateInput,
  NumberInput,
  Switch,
  Textarea,
  TimeInput,
  Select,
  RadioGroup,
  Radio,
  TextInput,
  DataTable,
  MultiSelect,
  Autocomplete,
} from "bms-ui-lib";
import dayjs from "dayjs";
import { useStore } from "vuex";

interface Props {
  template?: string;
  data?: Record<string, any>;
  setup?: string;
  ctx?: any;
}

let props = withDefaults(defineProps<Props>(), {
  template: "",
  data: () => ({}),
  ctx: () => ({}),
});

const store = useStore();

let modelValue = defineModel();

let component = defineComponent({
  template: props.template,

  data() {
    return { ...props.data, modelValue };
  },
  components: {
    Button,
    TextInput,
    NumberInput,
    DateInput,
    Checkbox,
    Switch,
    Textarea,
    TimeInput,
    Select,
    RadioGroup,
    Radio,
    DataTable,
    MultiSelect,
    Autocomplete,
  },
  setup(_props) {
    return new Function(
      "props",
      "defaultInfo",
      "ref",
      "reactive",
      "computed",
      "watch",
      "watchEffect",
      "onMounted",
      "modelValue",
      "store",
      "data",
      "dayjs",
      props.setup
    )(_props, props.data, ref, reactive, computed, watch, watchEffect, onMounted, modelValue, store, props.ctx, dayjs);
  },
});
</script>

<template>
  <component :is="component" />
</template>
