import { LambdaHandlers } from './lambda';

declare var lambda: LambdaHandlers;

lambda.handler = (_event, _context, callback) => {
  console.log('Hello World!');
  callback();
};
