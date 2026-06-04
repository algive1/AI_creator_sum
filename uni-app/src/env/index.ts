import { devEnv } from './dev';
import { prodEnv } from './prod';

export const appEnv = import.meta.env.PROD ? prodEnv : devEnv;
