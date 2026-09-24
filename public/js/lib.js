// One place to import Preact + htm from, so views stay tidy.
import { h, render, Fragment } from 'preact';
import { useState, useEffect, useMemo, useRef, useCallback, useReducer } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useMemo, useRef, useCallback, useReducer };
