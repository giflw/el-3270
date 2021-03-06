import { AfterViewInit } from '@angular/core';
import { AID } from '../../services/types';
import { AIDLookup } from '../../services/constants';
import { Alarm } from '../../state/status';
import { ChangeDetectionStrategy } from '@angular/core';
import { ClearCellValue } from '../../state/screen';
import { Component } from '@angular/core';
import { CursorAt } from '../../state/status';
import { ElementRef } from '@angular/core';
import { ErrorMessage } from '../../state/status';
import { EventEmitter } from '@angular/core';
import { HostListener } from '@angular/core';
import { Input } from '@angular/core';
import { KeyboardLocked } from '../../state/status';
import { LayoutStateModel } from '../../state/layout';
import { LifecycleComponent } from 'ellib';
import { LU3270Service } from '../../services/lu3270';
import { OnChange } from 'ellib';
import { Output } from '@angular/core';
import { PrefsStateModel } from '../../state/prefs';
import { ScreenStateModel } from '../../state/screen';
import { StatusStateModel } from '../../state/status';
import { Store } from '@ngxs/store';
import { UpdateCellValue } from '../../state/screen';

import { config } from '../../config';
import { debounce } from 'ellib';

/**
 * Screen component
 */

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'el3270-screen',
  styleUrls: ['screen.scss'],
  templateUrl: 'screen.html'
})

export class ScreenComponent extends LifecycleComponent
                             implements AfterViewInit {

  @Input() layout = { } as LayoutStateModel;
  @Input() prefs = { } as PrefsStateModel;
  @Input() screen = { } as ScreenStateModel;
  @Input() status = { } as StatusStateModel;

  @Output() fontSize = new EventEmitter<string>();

  private el: HTMLElement;
  private setup: Function;

  /** ctor */
  constructor(private element: ElementRef,
              private lu3270: LU3270Service,
              private store: Store) {
    super();
    // scale 3270 display for best fit
    this.setup = debounce(() => {
      // NOTE: these are magic numbers for the 3270 font based on a nominal
      // 18px size and a hack that forces the padding into the stylesheet
      this.el.style.padding = `${config.magic.paddingTop}px ${config.magic.paddingRight}px ${config.magic.paddingBottom}px ${config.magic.paddingLeft}px`;
      const cx = (this.prefs.numCols * config.magic.cxFactor) + config.magic.paddingLeft + config.magic.paddingRight;
      const cy = (this.prefs.numRows * config.magic.cyFactor) + config.magic.paddingTop + config.magic.paddingBottom;
      const scaleX = this.el.offsetWidth / cx;
      const scaleY = this.el.offsetHeight / cy;
      let fontSize;
      if (scaleX < scaleY)
        fontSize = `${config.magic.nominalFontSize * scaleX}px`;
      else fontSize = `${config.magic.nominalFontSize * scaleY}px`;
      this.el.style.fontSize = fontSize;
      this.fontSize.emit(fontSize);
    }, config.fontSizeThrottle);
  }

  /** Position the cursor based on a mouse click */
  cursorAt(cellID: string): void {
    if (cellID && cellID.startsWith('cell')) {
      this.store.dispatch(new CursorAt(parseInt(cellID.substring(4), 10)));
    }
  }

  /** Handle keystrokes */
  keystroke(event: KeyboardEvent): void {
    // NOTE: an ad-hoc shortcut for print
    if ((event.code === 'Enter') && event.ctrlKey)
      this.lu3270.print();
    else if (this.status.connected && !this.status.keyboardLocked) {
      if (event.code.startsWith('Arrow')) {
        const cursorOp: any = event.code.substring(5).toLowerCase();
        this.lu3270.cursorTo(this.status.cursorAt, cursorOp);
      }
      else if (event.code === 'Backspace') {
        const cursorAt = this.lu3270.cursorTo(this.status.cursorAt, 'left');
        this.store.dispatch(new ClearCellValue(cursorAt));
      }
      else if (event.code === 'Enter')
        this.lu3270.submit(AID.ENTER, this.status.cursorAt, this.screen.cells);
      else if (event.code.match(/F[0-9]+/)) {
        const aid = AIDLookup[`P${event.code}`];
        this.lu3270.submit(aid, this.status.cursorAt, this.screen.cells);
      }
      else if (event.code === 'Tab') {
        const tabOp = event.shiftKey? 'bwd' : 'fwd';
        this.lu3270.tabTo(this.status.cursorAt, this.screen.cells, tabOp);
      }
      else if (event.key.length === 1) {
        const cursorAt = this.status.cursorAt;
        const value = event.key;
        this.store.dispatch(new UpdateCellValue({ cursorAt, value }));
      }
    }
    // NOTE: Escape can get us out of a keyboard locked state
    if (event.code === 'Escape') {
      this.store.dispatch([new ErrorMessage(''),
                           new KeyboardLocked(false),
                           new Alarm(false)]);
    }
    event.preventDefault();
  }

  // listeners

  @HostListener('window:resize') onResize() {
    this.setup();
  }

  // bind OnChange handlers

  @OnChange('layout') updateLayout() {
    this.setup();
  }

  @OnChange('prefs') updatePrefs() {
    if (this.prefs) {
      const style = document.documentElement.style;
      switch (this.prefs.color) {
        case 'blue':
          style.setProperty('--lu3270-color', 'var(--mat-blue-300)');
          style.setProperty('--lu3270-highlight-color', 'var(--mat-blue-400)');
          break;
        case 'green':
          style.setProperty('--lu3270-color', 'var(--mat-green-300)');
          style.setProperty('--lu3270-highlight-color', 'var(--mat-green-400)');
          break;
        case 'orange':
          style.setProperty('--lu3270-color', 'var(--mat-orange-300)');
          style.setProperty('--lu3270-highlight-color', 'var(--mat-orange-400)');
          break;
        case 'white':
          style.setProperty('--lu3270-color', 'var(--mat-grey-100)');
          style.setProperty('--lu3270-highlight-color', 'white');
          break;
      }
      style.setProperty('--lu3270-cols', String(this.prefs.numCols));
      style.setProperty('--lu3270-rows', String(this.prefs.numRows));
      this.setup();
    }
  }

  @OnChange('screen') snapshotScreen() {
    if (this.screen)
      this.lu3270.screenSnapshot = this.screen;
  }

  @OnChange('status') snapshotStatus() {
    if (this.status)
      this.lu3270.statusSnapshot = this.status;
  }

  // lifecycle methods

  ngAfterViewInit() {
    this.el = this.element.nativeElement;
    this.setup();
  }

}
