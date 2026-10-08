import { mockClient } from './mockClient';
import { BlinkflowClient } from './types';

// TODO: select client based on env variable here
export const client: BlinkflowClient = mockClient;
