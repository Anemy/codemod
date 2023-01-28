import { expect } from 'chai';

import { addNumbers } from '../src';

describe('#addNumbers', function() {
  it('adds numbers', function() {
    expect(addNumbers(1, 1)).to.equal(2);
  });
});
