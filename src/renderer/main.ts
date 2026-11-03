import { createApp } from 'vue';
import App from './App.vue';
import SecondScreen from './SecondScreen.vue';
import '@fontsource/marcellus/400.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import './styles.css';
import { connectStore } from './store';

connectStore().then(() => createApp(location.hash === '#second' ? SecondScreen : App).mount('#app'));
