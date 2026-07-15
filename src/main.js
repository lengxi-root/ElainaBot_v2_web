import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  NAvatar,
  NButton,
  NCard,
  NConfigProvider,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDialogProvider,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NMessageProvider,
  NModal,
  NNotificationProvider,
  NPagination,
  NPopconfirm,
  NPopover,
  NRadioButton,
  NRadioGroup,
  NSpin,
  NSwitch,
  NTag,
  NText,
  NTooltip,
  NTree,
} from 'naive-ui'
import './assets/global.css'
import './assets/design.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
const components = {
  NAvatar,
  NButton,
  NCard,
  NConfigProvider,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NDialogProvider,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NMessageProvider,
  NModal,
  NNotificationProvider,
  NPagination,
  NPopconfirm,
  NPopover,
  NRadioButton,
  NRadioGroup,
  NSpin,
  NSwitch,
  NTag,
  NText,
  NTooltip,
  NTree,
}

for (const [name, component] of Object.entries(components)) {
  app.component(name, component)
}

app.use(createPinia())
app.use(router)
app.mount('#app')
