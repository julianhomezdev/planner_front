import { Component, OnDestroy, OnInit } from '@angular/core';

import { RouterLink, RouterLinkActive } from '@angular/router';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'nav-bar-component',

  standalone: true,

  imports: [RouterLink, RouterLinkActive, CommonModule],

  templateUrl: './nav-bar.component.html',

  styleUrls: ['./nav-bar.component.css'],
})
export class NavBarComponent implements OnInit, OnDestroy {
  loggedUser: string = '';

  ngOnDestroy(): void {
    throw new Error('Method not implemented.');
  }
  ngOnInit(): void {
    this.loadUserName();
  }

  loadUserName(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const authUserRaw = localStorage.getItem('auth_user');

    if (!authUserRaw) {
      console.warn('No auth user in localstorage');

      return;
    }

    try {
      const authUser = JSON.parse(authUserRaw);

      this.loggedUser = authUser.userName ?? '';
    } catch (error) {
      console.error('Error parsing auth user', error);
    }
  }

  openMenus: { [key: string]: boolean } = {
    home: false,

    proyectos: false,

    rh: false,

    logistics: false,
  };

  toggleSubmenu(menu: string): void {
    this.openMenus[menu] = !this.openMenus[menu];
  }
}
