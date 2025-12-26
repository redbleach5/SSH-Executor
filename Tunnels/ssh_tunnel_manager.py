#!/usr/bin/env python3
"""
SSH Tunnel Manager - Комплексный инструмент для работы с SSH туннелями
Включает: создание туннеля, сканирование портов, диагностику

Автор: SSH Tunnel Manager
Версия: 1.0.0
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import subprocess
import threading
import webbrowser
import os
import sys
import shutil
from pathlib import Path
from datetime import datetime

class SSHTunnelManager:
    def __init__(self):
        self.tunnel_process = None
        self.scan_process = None
        self.is_tunnel_connected = False
        self.is_scanning = False
        
        # Создание главного окна
        self.root = tk.Tk()
        self.root.title("SSH Tunnel Manager v1.0")
        self.root.geometry("700x680")
        self.root.resizable(False, False)
        
        # Цветовая схема (Catppuccin Mocha)
        self.colors = {
            'bg': '#1e1e2e',
            'surface': '#313244',
            'surface2': '#45475a',
            'overlay': '#585b70',
            'text': '#cdd6f4',
            'subtext': '#a6adc8',
            'green': '#a6e3a1',
            'red': '#f38ba8',
            'yellow': '#f9e2af',
            'blue': '#89b4fa',
            'mauve': '#cba6f7',
            'peach': '#fab387',
            'teal': '#94e2d5',
            'lavender': '#b4befe',
        }
        
        self.root.configure(bg=self.colors['bg'])
        
        # Настройки по умолчанию
        self.settings = {
            'ssh_host': '10.249.224.200',
            'ssh_user': 'root',
            'ssh_key': '',  # Пустой = использовать Pageant
            'target_host': '192.168.1.111',
            'target_port': '80',
            'local_port': '8080',
        }
        
        self.setup_styles()
        self.create_widgets()
        self.find_plink()
        
    def setup_styles(self):
        style = ttk.Style()
        style.theme_use('clam')
        
        style.configure('TFrame', background=self.colors['bg'])
        style.configure('TLabel', background=self.colors['bg'], 
                       foreground=self.colors['text'], font=('Segoe UI', 10))
        style.configure('Title.TLabel', font=('Segoe UI', 20, 'bold'),
                       foreground=self.colors['blue'])
        style.configure('Subtitle.TLabel', font=('Segoe UI', 11),
                       foreground=self.colors['subtext'])
        style.configure('Status.TLabel', font=('Segoe UI', 11, 'bold'))
        style.configure('TNotebook', background=self.colors['bg'])
        style.configure('TNotebook.Tab', background=self.colors['surface'],
                       foreground=self.colors['text'], padding=[20, 8],
                       font=('Segoe UI', 10, 'bold'))
        style.map('TNotebook.Tab',
                 background=[('selected', self.colors['surface2'])],
                 foreground=[('selected', self.colors['blue'])])
        
    def create_widgets(self):
        # Заголовок
        header_frame = tk.Frame(self.root, bg=self.colors['bg'])
        header_frame.pack(fill='x', padx=20, pady=(15, 5))
        
        title = ttk.Label(header_frame, text="🔐 SSH Tunnel Manager",
                         style='Title.TLabel')
        title.pack()
        
        subtitle = ttk.Label(header_frame, 
                            text="Туннелирование • Сканирование • Диагностика",
                            style='Subtitle.TLabel')
        subtitle.pack()
        
        # Вкладки
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill='both', expand=True, padx=15, pady=10)
        
        # Вкладка "Туннель"
        self.tunnel_tab = tk.Frame(self.notebook, bg=self.colors['bg'])
        self.notebook.add(self.tunnel_tab, text="🔗 Туннель")
        self.create_tunnel_tab()
        
        # Вкладка "Сканер"
        self.scanner_tab = tk.Frame(self.notebook, bg=self.colors['bg'])
        self.notebook.add(self.scanner_tab, text="🔍 Сканер портов")
        self.create_scanner_tab()
        
        # Вкладка "Настройки"
        self.settings_tab = tk.Frame(self.notebook, bg=self.colors['bg'])
        self.notebook.add(self.settings_tab, text="⚙️ Настройки")
        self.create_settings_tab()
        
    def create_tunnel_tab(self):
        tab = self.tunnel_tab
        
        # === Информация о подключении ===
        info_frame = tk.LabelFrame(tab, text=" Параметры туннеля ",
                                   bg=self.colors['bg'], fg=self.colors['green'],
                                   font=('Segoe UI', 10, 'bold'), padx=15, pady=10)
        info_frame.pack(fill='x', padx=15, pady=(15, 10))
        
        # Строка 1
        row1 = tk.Frame(info_frame, bg=self.colors['bg'])
        row1.pack(fill='x', pady=5)
        
        tk.Label(row1, text="SSH хост:", bg=self.colors['bg'], 
                fg=self.colors['text'], font=('Segoe UI', 10), width=15, anchor='e').pack(side='left')
        self.tunnel_host_var = tk.StringVar(value=self.settings['ssh_host'])
        self.tunnel_host_entry = tk.Entry(row1, textvariable=self.tunnel_host_var,
                                          width=20, bg=self.colors['surface'],
                                          fg=self.colors['text'], insertbackground=self.colors['text'],
                                          relief='flat', font=('Segoe UI', 10))
        self.tunnel_host_entry.pack(side='left', padx=(10, 20))
        
        tk.Label(row1, text="Пользователь:", bg=self.colors['bg'],
                fg=self.colors['text'], font=('Segoe UI', 10)).pack(side='left')
        self.tunnel_user_var = tk.StringVar(value=self.settings['ssh_user'])
        tk.Entry(row1, textvariable=self.tunnel_user_var, width=12,
                bg=self.colors['surface'], fg=self.colors['text'],
                insertbackground=self.colors['text'], relief='flat',
                font=('Segoe UI', 10)).pack(side='left', padx=(10, 0))
        
        # Строка 2
        row2 = tk.Frame(info_frame, bg=self.colors['bg'])
        row2.pack(fill='x', pady=5)
        
        tk.Label(row2, text="Целевой IP:", bg=self.colors['bg'],
                fg=self.colors['text'], font=('Segoe UI', 10), width=15, anchor='e').pack(side='left')
        self.tunnel_target_var = tk.StringVar(value=self.settings['target_host'])
        tk.Entry(row2, textvariable=self.tunnel_target_var, width=20,
                bg=self.colors['surface'], fg=self.colors['text'],
                insertbackground=self.colors['text'], relief='flat',
                font=('Segoe UI', 10)).pack(side='left', padx=(10, 20))
        
        tk.Label(row2, text="Порт:", bg=self.colors['bg'],
                fg=self.colors['text'], font=('Segoe UI', 10)).pack(side='left')
        self.tunnel_port_var = tk.StringVar(value=self.settings['target_port'])
        tk.Entry(row2, textvariable=self.tunnel_port_var, width=8,
                bg=self.colors['surface'], fg=self.colors['text'],
                insertbackground=self.colors['text'], relief='flat',
                font=('Segoe UI', 10)).pack(side='left', padx=(10, 0))
        
        # Строка 3
        row3 = tk.Frame(info_frame, bg=self.colors['bg'])
        row3.pack(fill='x', pady=5)
        
        tk.Label(row3, text="Локальный порт:", bg=self.colors['bg'],
                fg=self.colors['text'], font=('Segoe UI', 10), width=15, anchor='e').pack(side='left')
        self.local_port_var = tk.StringVar(value=self.settings['local_port'])
        self.local_port_var.trace('w', self.update_url_display)
        tk.Entry(row3, textvariable=self.local_port_var, width=8,
                bg=self.colors['surface'], fg=self.colors['text'],
                insertbackground=self.colors['text'], relief='flat',
                font=('Segoe UI', 10)).pack(side='left', padx=(10, 20))
        
        self.url_label = tk.Label(row3, text="→  http://localhost:8080",
                                  bg=self.colors['bg'], fg=self.colors['blue'],
                                  font=('Segoe UI', 10, 'bold'))
        self.url_label.pack(side='left')
        
        # === Статус и кнопки ===
        status_frame = tk.Frame(tab, bg=self.colors['bg'])
        status_frame.pack(fill='x', padx=15, pady=15)
        
        self.tunnel_status = tk.Label(status_frame, text="● Отключено",
                                      bg=self.colors['bg'], fg=self.colors['red'],
                                      font=('Segoe UI', 12, 'bold'))
        self.tunnel_status.pack(side='left')
        
        self.plink_status = tk.Label(status_frame, text="",
                                     bg=self.colors['bg'], fg=self.colors['subtext'],
                                     font=('Segoe UI', 9))
        self.plink_status.pack(side='right')
        
        # Кнопки
        btn_frame = tk.Frame(tab, bg=self.colors['bg'])
        btn_frame.pack(pady=10)
        
        self.connect_btn = tk.Button(btn_frame, text="🔗 Подключить",
                                     command=self.toggle_tunnel,
                                     bg=self.colors['green'], fg='#1e1e2e',
                                     font=('Segoe UI', 11, 'bold'),
                                     relief='flat', cursor='hand2',
                                     padx=25, pady=8, width=15)
        self.connect_btn.pack(side='left', padx=10)
        
        self.browser_btn = tk.Button(btn_frame, text="🌐 Открыть браузер",
                                     command=self.open_browser,
                                     bg=self.colors['blue'], fg='#1e1e2e',
                                     font=('Segoe UI', 11, 'bold'),
                                     relief='flat', cursor='hand2',
                                     padx=25, pady=8, width=15,
                                     state='disabled')
        self.browser_btn.pack(side='left', padx=10)
        
        # === Лог ===
        log_frame = tk.LabelFrame(tab, text=" Лог подключения ",
                                  bg=self.colors['bg'], fg=self.colors['lavender'],
                                  font=('Segoe UI', 10, 'bold'), padx=10, pady=10)
        log_frame.pack(fill='both', expand=True, padx=15, pady=(5, 15))
        
        scrollbar = tk.Scrollbar(log_frame)
        scrollbar.pack(side='right', fill='y')
        
        self.tunnel_log = tk.Text(log_frame, bg=self.colors['surface'],
                                  fg=self.colors['text'], font=('Consolas', 9),
                                  relief='flat', height=10,
                                  yscrollcommand=scrollbar.set, state='disabled')
        self.tunnel_log.pack(fill='both', expand=True)
        scrollbar.config(command=self.tunnel_log.yview)
        
        # Теги для цветов
        self.tunnel_log.tag_configure('success', foreground=self.colors['green'])
        self.tunnel_log.tag_configure('error', foreground=self.colors['red'])
        self.tunnel_log.tag_configure('info', foreground=self.colors['blue'])
        self.tunnel_log.tag_configure('warning', foreground=self.colors['yellow'])
        
    def create_scanner_tab(self):
        tab = self.scanner_tab
        
        # === Параметры сканирования ===
        scan_frame = tk.LabelFrame(tab, text=" Параметры сканирования ",
                                   bg=self.colors['bg'], fg=self.colors['peach'],
                                   font=('Segoe UI', 10, 'bold'), padx=15, pady=10)
        scan_frame.pack(fill='x', padx=15, pady=(15, 10))
        
        row1 = tk.Frame(scan_frame, bg=self.colors['bg'])
        row1.pack(fill='x', pady=5)
        
        tk.Label(row1, text="Целевой IP:", bg=self.colors['bg'],
                fg=self.colors['text'], font=('Segoe UI', 10)).pack(side='left')
        self.scan_target_var = tk.StringVar(value=self.settings['target_host'])
        tk.Entry(row1, textvariable=self.scan_target_var, width=18,
                bg=self.colors['surface'], fg=self.colors['text'],
                insertbackground=self.colors['text'], relief='flat',
                font=('Segoe UI', 10)).pack(side='left', padx=(10, 0))
        
        # Кнопка сканирования
        btn_frame = tk.Frame(tab, bg=self.colors['bg'])
        btn_frame.pack(pady=10)
        
        self.scan_btn = tk.Button(btn_frame, text="🔍 Сканировать порты",
                                  command=self.toggle_scan,
                                  bg=self.colors['teal'], fg='#1e1e2e',
                                  font=('Segoe UI', 11, 'bold'),
                                  relief='flat', cursor='hand2',
                                  padx=25, pady=8)
        self.scan_btn.pack(side='left', padx=10)
        
        self.diag_btn = tk.Button(btn_frame, text="🩺 Диагностика",
                                  command=self.run_diagnostics,
                                  bg=self.colors['mauve'], fg='#1e1e2e',
                                  font=('Segoe UI', 11, 'bold'),
                                  relief='flat', cursor='hand2',
                                  padx=25, pady=8)
        self.diag_btn.pack(side='left', padx=10)
        
        # Статус
        self.scan_status = tk.Label(tab, text="Готов к сканированию",
                                    bg=self.colors['bg'], fg=self.colors['text'],
                                    font=('Segoe UI', 10))
        self.scan_status.pack(pady=5)
        
        # === Результаты ===
        results_frame = tk.LabelFrame(tab, text=" Результаты ",
                                      bg=self.colors['bg'], fg=self.colors['blue'],
                                      font=('Segoe UI', 10, 'bold'), padx=10, pady=10)
        results_frame.pack(fill='both', expand=True, padx=15, pady=(5, 15))
        
        scrollbar = tk.Scrollbar(results_frame)
        scrollbar.pack(side='right', fill='y')
        
        self.scan_results = tk.Text(results_frame, bg=self.colors['surface'],
                                    fg=self.colors['text'], font=('Consolas', 10),
                                    relief='flat', yscrollcommand=scrollbar.set,
                                    state='disabled')
        self.scan_results.pack(fill='both', expand=True)
        scrollbar.config(command=self.scan_results.yview)
        
        # Теги
        self.scan_results.tag_configure('open', foreground=self.colors['green'])
        self.scan_results.tag_configure('closed', foreground='#6c7086')
        self.scan_results.tag_configure('header', foreground=self.colors['blue'])
        self.scan_results.tag_configure('http', foreground=self.colors['peach'])
        
    def create_settings_tab(self):
        tab = self.settings_tab
        
        # === SSH ключ ===
        key_frame = tk.LabelFrame(tab, text=" SSH Ключ (опционально) ",
                                  bg=self.colors['bg'], fg=self.colors['mauve'],
                                  font=('Segoe UI', 10, 'bold'), padx=15, pady=15)
        key_frame.pack(fill='x', padx=15, pady=(15, 10))
        
        info_label = tk.Label(key_frame, 
                             text="Оставьте пустым для использования Pageant (рекомендуется)",
                             bg=self.colors['bg'], fg=self.colors['subtext'],
                             font=('Segoe UI', 9))
        info_label.pack(anchor='w')
        
        key_row = tk.Frame(key_frame, bg=self.colors['bg'])
        key_row.pack(fill='x', pady=(10, 0))
        
        tk.Label(key_row, text="PPK файл:", bg=self.colors['bg'],
                fg=self.colors['text'], font=('Segoe UI', 10)).pack(side='left')
        
        self.key_var = tk.StringVar(value=self.settings['ssh_key'])
        self.key_entry = tk.Entry(key_row, textvariable=self.key_var, width=45,
                                  bg=self.colors['surface'], fg=self.colors['text'],
                                  insertbackground=self.colors['text'], relief='flat',
                                  font=('Segoe UI', 10))
        self.key_entry.pack(side='left', padx=(10, 10))
        
        browse_btn = tk.Button(key_row, text="📁", command=self.browse_key,
                              bg=self.colors['surface2'], fg=self.colors['text'],
                              relief='flat', font=('Segoe UI', 10), cursor='hand2')
        browse_btn.pack(side='left')
        
        # === Информация ===
        info_frame = tk.LabelFrame(tab, text=" Информация ",
                                   bg=self.colors['bg'], fg=self.colors['blue'],
                                   font=('Segoe UI', 10, 'bold'), padx=15, pady=15)
        info_frame.pack(fill='x', padx=15, pady=10)
        
        self.info_text = tk.Text(info_frame, bg=self.colors['surface'],
                                 fg=self.colors['text'], font=('Consolas', 9),
                                 relief='flat', height=8, state='disabled')
        self.info_text.pack(fill='x')
        
        # === Кнопки ===
        btn_frame = tk.Frame(tab, bg=self.colors['bg'])
        btn_frame.pack(pady=15)
        
        tk.Button(btn_frame, text="🔄 Проверить plink",
                 command=self.find_plink,
                 bg=self.colors['surface2'], fg=self.colors['text'],
                 font=('Segoe UI', 10), relief='flat', cursor='hand2',
                 padx=15, pady=5).pack(side='left', padx=5)
        
        tk.Button(btn_frame, text="📋 Проверить Pageant",
                 command=self.check_pageant,
                 bg=self.colors['surface2'], fg=self.colors['text'],
                 font=('Segoe UI', 10), relief='flat', cursor='hand2',
                 padx=15, pady=5).pack(side='left', padx=5)
        
    # ==================== ФУНКЦИИ ====================
    
    def find_plink(self):
        """Поиск plink.exe"""
        self.plink_path = None
        
        # Проверяем в PATH
        plink = shutil.which('plink')
        if plink:
            self.plink_path = plink
        else:
            # Стандартные пути
            paths = [
                r"C:\Program Files\PuTTY\plink.exe",
                r"C:\Program Files (x86)\PuTTY\plink.exe",
                os.path.join(os.path.dirname(__file__), "plink.exe"),
            ]
            for path in paths:
                if os.path.exists(path):
                    self.plink_path = path
                    break
        
        if self.plink_path:
            self.plink_status.configure(text=f"plink: ✓ найден", fg=self.colors['green'])
            self.update_info(f"plink найден: {self.plink_path}")
        else:
            self.plink_status.configure(text="plink: ✗ не найден", fg=self.colors['red'])
            self.update_info("plink.exe не найден! Установите PuTTY.")
            
    def check_pageant(self):
        """Проверка Pageant"""
        try:
            result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq pageant.exe'],
                                   capture_output=True, text=True)
            if 'pageant.exe' in result.stdout.lower():
                self.update_info("✓ Pageant запущен\n\nКлючи будут браться автоматически.")
                messagebox.showinfo("Pageant", "Pageant запущен и готов к использованию!")
            else:
                self.update_info("✗ Pageant не запущен\n\nЗапустите Pageant и загрузите ваш ключ.")
                messagebox.showwarning("Pageant", "Pageant не запущен!\n\nЗапустите Pageant и загрузите ваш SSH ключ.")
        except Exception as e:
            self.update_info(f"Ошибка проверки: {e}")
            
    def update_info(self, text):
        """Обновление информационного текста"""
        self.info_text.configure(state='normal')
        self.info_text.delete('1.0', 'end')
        self.info_text.insert('end', f"[{datetime.now().strftime('%H:%M:%S')}] {text}")
        self.info_text.configure(state='disabled')
        
    def browse_key(self):
        """Выбор файла ключа"""
        filename = filedialog.askopenfilename(
            title="Выберите PPK ключ",
            initialdir=Path.home() / ".ssh",
            filetypes=[("PuTTY Private Key", "*.ppk"), ("All files", "*.*")]
        )
        if filename:
            self.key_var.set(filename)
            
    def update_url_display(self, *args):
        """Обновление отображения URL"""
        port = self.local_port_var.get()
        self.url_label.configure(text=f"→  http://localhost:{port}")
        
    def log_tunnel(self, message, tag=None):
        """Добавление записи в лог туннеля"""
        self.tunnel_log.configure(state='normal')
        timestamp = datetime.now().strftime('%H:%M:%S')
        if tag:
            self.tunnel_log.insert('end', f"[{timestamp}] {message}\n", tag)
        else:
            self.tunnel_log.insert('end', f"[{timestamp}] {message}\n")
        self.tunnel_log.see('end')
        self.tunnel_log.configure(state='disabled')
        
    def log_scan(self, message, tag=None):
        """Добавление записи в результаты сканирования"""
        self.scan_results.configure(state='normal')
        if tag:
            self.scan_results.insert('end', f"{message}\n", tag)
        else:
            self.scan_results.insert('end', f"{message}\n")
        self.scan_results.see('end')
        self.scan_results.configure(state='disabled')
        
    def clear_scan_log(self):
        """Очистка лога сканирования"""
        self.scan_results.configure(state='normal')
        self.scan_results.delete('1.0', 'end')
        self.scan_results.configure(state='disabled')
        
    # ==================== ТУННЕЛЬ ====================
    
    def toggle_tunnel(self):
        """Переключение состояния туннеля"""
        if not self.is_tunnel_connected:
            self.connect_tunnel()
        else:
            self.disconnect_tunnel()
            
    def connect_tunnel(self):
        """Подключение туннеля"""
        if not self.plink_path:
            messagebox.showerror("Ошибка", "plink.exe не найден!\nУстановите PuTTY.")
            return
            
        # Проверяем ключ если указан
        key_path = self.key_var.get().strip()
        if key_path and not os.path.exists(key_path):
            messagebox.showerror("Ошибка", f"SSH ключ не найден:\n{key_path}")
            return
            
        self.tunnel_status.configure(text="● Подключение...", fg=self.colors['yellow'])
        self.log_tunnel("Запуск туннеля...", 'info')
        
        # Формируем команду
        ssh_host = self.tunnel_host_var.get()
        ssh_user = self.tunnel_user_var.get()
        target = self.tunnel_target_var.get()
        target_port = self.tunnel_port_var.get()
        local_port = self.local_port_var.get()
        
        cmd = [self.plink_path, "-ssh"]
        
        # Добавляем ключ если указан
        if key_path:
            cmd.extend(["-i", key_path])
            
        cmd.extend([
            "-L", f"{local_port}:{target}:{target_port}",
            "-N",  # Не выполнять команды
            f"{ssh_user}@{ssh_host}"
        ])
        
        self.log_tunnel(f"Команда: {' '.join(cmd)}", 'info')
        
        def run_tunnel():
            try:
                # Запускаем plink
                startupinfo = None
                if os.name == 'nt':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    
                self.tunnel_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    stdin=subprocess.PIPE,
                    startupinfo=startupinfo,
                    encoding='utf-8',
                    errors='ignore'
                )
                
                # Отправляем Enter для начала сессии
                import time
                time.sleep(2)
                
                if self.tunnel_process.poll() is not None:
                    # Процесс завершился с ошибкой
                    stderr = self.tunnel_process.stderr.read()
                    self.root.after(0, lambda: self.tunnel_failed(stderr))
                    return
                    
                # Отправляем Enter
                try:
                    self.tunnel_process.stdin.write('\n')
                    self.tunnel_process.stdin.flush()
                except:
                    pass
                    
                time.sleep(1)
                
                if self.tunnel_process.poll() is None:
                    self.root.after(0, self.tunnel_success)
                else:
                    stderr = self.tunnel_process.stderr.read()
                    self.root.after(0, lambda: self.tunnel_failed(stderr))
                    
            except Exception as e:
                self.root.after(0, lambda: self.tunnel_failed(str(e)))
                
        thread = threading.Thread(target=run_tunnel, daemon=True)
        thread.start()
        
    def tunnel_success(self):
        """Туннель успешно подключен"""
        self.is_tunnel_connected = True
        self.tunnel_status.configure(text="● Подключено", fg=self.colors['green'])
        self.connect_btn.configure(text="❌ Отключить", bg=self.colors['red'])
        self.browser_btn.configure(state='normal')
        self.log_tunnel(f"Туннель открыт: localhost:{self.local_port_var.get()} → "
                       f"{self.tunnel_target_var.get()}:{self.tunnel_port_var.get()}", 'success')
        
    def tunnel_failed(self, error):
        """Ошибка подключения туннеля"""
        self.tunnel_status.configure(text="● Ошибка", fg=self.colors['red'])
        self.log_tunnel(f"Ошибка: {error}", 'error')
        
    def disconnect_tunnel(self):
        """Отключение туннеля"""
        if self.tunnel_process:
            try:
                self.tunnel_process.terminate()
                self.tunnel_process.wait(timeout=3)
            except:
                self.tunnel_process.kill()
            self.tunnel_process = None
            
        self.is_tunnel_connected = False
        self.tunnel_status.configure(text="● Отключено", fg=self.colors['red'])
        self.connect_btn.configure(text="🔗 Подключить", bg=self.colors['green'])
        self.browser_btn.configure(state='disabled')
        self.log_tunnel("Туннель закрыт", 'warning')
        
    def open_browser(self):
        """Открытие браузера"""
        url = f"http://localhost:{self.local_port_var.get()}"
        self.log_tunnel(f"Открытие браузера: {url}", 'info')
        webbrowser.open(url)
        
    # ==================== СКАНЕР ====================
    
    def toggle_scan(self):
        """Переключение сканирования"""
        if not self.is_scanning:
            self.start_scan()
        else:
            self.stop_scan()
            
    def start_scan(self):
        """Запуск сканирования"""
        if not self.plink_path:
            messagebox.showerror("Ошибка", "plink.exe не найден!")
            return
            
        self.is_scanning = True
        self.scan_btn.configure(text="⏹ Остановить", bg=self.colors['red'])
        self.scan_status.configure(text="Сканирование...", fg=self.colors['yellow'])
        self.clear_scan_log()
        
        target = self.scan_target_var.get()
        ssh_host = self.tunnel_host_var.get()
        ssh_user = self.tunnel_user_var.get()
        key_path = self.key_var.get().strip()
        
        ports = [80, 443, 8080, 8443, 81, 82, 8000, 8008, 8081, 8888, 
                 3000, 5000, 9000, 9090, 10000]
        
        scan_script = f'''
echo "=== Сканирование {target} ==="
for port in {' '.join(map(str, ports))}; do
    (echo > /dev/tcp/{target}/$port) 2>/dev/null && echo "OPEN:$port" || echo "CLOSED:$port"
done
echo "=== HTTP проверка ==="
for port in 80 8080 8000 81 443 8443; do
    response=$(curl -skI --connect-timeout 2 --max-time 3 http://{target}:$port 2>/dev/null | head -1)
    if [ -n "$response" ]; then
        echo "HTTP:$port:$response"
        server=$(curl -skI --connect-timeout 2 http://{target}:$port 2>/dev/null | grep -i "Server:" | head -1)
        [ -n "$server" ] && echo "SERVER:$port:$server"
    fi
    response=$(curl -skI --connect-timeout 2 --max-time 3 https://{target}:$port 2>/dev/null | head -1)
    if [ -n "$response" ]; then
        echo "HTTPS:$port:$response"
    fi
done
echo "=== DONE ==="
'''
        
        def run_scan():
            try:
                self.log_scan(f"Подключение к {ssh_host}...", 'header')
                self.log_scan(f"Сканирование портов на {target}", 'header')
                self.log_scan("=" * 45, 'header')
                self.log_scan("")
                
                cmd = [self.plink_path, "-ssh", "-batch"]
                if key_path:
                    cmd.extend(["-i", key_path])
                cmd.extend([f"{ssh_user}@{ssh_host}", scan_script])
                
                self.scan_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                    encoding='utf-8',
                    errors='ignore'
                )
                
                open_ports = []
                
                for line in iter(self.scan_process.stdout.readline, ''):
                    if not self.is_scanning:
                        break
                        
                    decoded = line.strip()
                    if not decoded:
                        continue
                        
                    if decoded.startswith("OPEN:"):
                        port = decoded.split(":")[1]
                        open_ports.append(port)
                        self.root.after(0, lambda p=port: self.log_scan(f"✓ Порт {p}: ОТКРЫТ", 'open'))
                    elif decoded.startswith("CLOSED:"):
                        port = decoded.split(":")[1]
                        self.root.after(0, lambda p=port: self.log_scan(f"✗ Порт {p}: закрыт", 'closed'))
                    elif decoded.startswith("HTTP:") or decoded.startswith("HTTPS:"):
                        parts = decoded.split(":", 2)
                        proto, port = parts[0], parts[1]
                        response = parts[2] if len(parts) > 2 else ""
                        self.root.after(0, lambda pr=proto, p=port, r=response:
                                       self.log_scan(f"\n🌐 {pr} на порту {p}:\n   {r}", 'http'))
                    elif decoded.startswith("SERVER:"):
                        parts = decoded.split(":", 2)
                        if len(parts) > 2:
                            self.root.after(0, lambda s=parts[2]: self.log_scan(f"   {s}", 'http'))
                    elif "===" in decoded:
                        self.root.after(0, lambda d=decoded: self.log_scan(f"\n{d}", 'header'))
                        
                self.root.after(0, lambda: self.scan_complete(open_ports))
                
            except Exception as e:
                self.root.after(0, lambda: self.log_scan(f"Ошибка: {e}", 'error'))
                self.root.after(0, self.scan_stopped)
                
        thread = threading.Thread(target=run_scan, daemon=True)
        thread.start()
        
    def scan_complete(self, open_ports):
        """Сканирование завершено"""
        self.log_scan("")
        self.log_scan("=" * 45, 'header')
        if open_ports:
            self.log_scan(f"Найдено открытых портов: {len(open_ports)}", 'open')
            self.log_scan(f"Порты: {', '.join(open_ports)}", 'open')
        else:
            self.log_scan("Открытых веб-портов не найдено", 'closed')
        self.scan_stopped()
        
    def scan_stopped(self):
        """Сканирование остановлено"""
        self.is_scanning = False
        self.scan_btn.configure(text="🔍 Сканировать порты", bg=self.colors['teal'])
        self.scan_status.configure(text="Сканирование завершено", fg=self.colors['green'])
        
    def stop_scan(self):
        """Остановка сканирования"""
        if self.scan_process:
            self.scan_process.terminate()
        self.is_scanning = False
        self.scan_btn.configure(text="🔍 Сканировать порты", bg=self.colors['teal'])
        self.scan_status.configure(text="Сканирование остановлено", fg=self.colors['text'])
        
    def run_diagnostics(self):
        """Запуск диагностики"""
        if not self.plink_path:
            messagebox.showerror("Ошибка", "plink.exe не найден!")
            return
            
        self.clear_scan_log()
        self.scan_status.configure(text="Диагностика...", fg=self.colors['yellow'])
        
        target = self.scan_target_var.get()
        ssh_host = self.tunnel_host_var.get()
        ssh_user = self.tunnel_user_var.get()
        key_path = self.key_var.get().strip()
        
        diag_script = f'''
echo "=== ДИАГНОСТИКА ==="
echo ""
echo "[1] Ping до {target}:"
ping -c 2 -W 2 {target} 2>/dev/null && echo "PING: OK" || echo "PING: FAIL"
echo ""
echo "[2] Проверка порта 80:"
(echo > /dev/tcp/{target}/80) 2>/dev/null && echo "Порт 80: ОТКРЫТ" || echo "Порт 80: закрыт"
echo ""
echo "[3] HTTP заголовки:"
curl -sI --connect-timeout 5 http://{target}/ 2>/dev/null | head -10 || echo "HTTP не отвечает"
echo ""
echo "[4] ARP запись:"
ip neigh show 2>/dev/null | grep -i "{target}" || arp -a 2>/dev/null | grep -i "{target}" || echo "Не найдено"
echo ""
echo "=== ГОТОВО ==="
'''
        
        def run_diag():
            try:
                self.log_scan("Запуск диагностики...", 'header')
                self.log_scan(f"SSH хост: {ssh_host}", 'info')
                self.log_scan(f"Целевой IP: {target}", 'info')
                self.log_scan("=" * 45, 'header')
                self.log_scan("")
                
                cmd = [self.plink_path, "-ssh", "-batch"]
                if key_path:
                    cmd.extend(["-i", key_path])
                cmd.extend([f"{ssh_user}@{ssh_host}", diag_script])
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60,
                                       encoding='utf-8', errors='ignore')
                
                for line in result.stdout.split('\n'):
                    if line.strip():
                        if 'OK' in line or 'ОТКРЫТ' in line:
                            self.root.after(0, lambda l=line: self.log_scan(l, 'open'))
                        elif 'FAIL' in line or 'закрыт' in line or 'не отвечает' in line:
                            self.root.after(0, lambda l=line: self.log_scan(l, 'error'))
                        elif '===' in line or '[' in line:
                            self.root.after(0, lambda l=line: self.log_scan(l, 'header'))
                        else:
                            self.root.after(0, lambda l=line: self.log_scan(l))
                            
                self.root.after(0, lambda: self.scan_status.configure(
                    text="Диагностика завершена", fg=self.colors['green']))
                    
            except Exception as e:
                self.root.after(0, lambda: self.log_scan(f"Ошибка: {e}", 'error'))
                self.root.after(0, lambda: self.scan_status.configure(
                    text="Ошибка диагностики", fg=self.colors['red']))
                    
        thread = threading.Thread(target=run_diag, daemon=True)
        thread.start()
        
    # ==================== ЗАПУСК ====================
    
    def run(self):
        """Запуск приложения"""
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.log_tunnel("SSH Tunnel Manager запущен", 'info')
        self.log_tunnel("Нажмите 'Подключить' для создания туннеля", 'info')
        self.root.mainloop()
        
    def on_close(self):
        """Закрытие приложения"""
        if self.tunnel_process:
            self.tunnel_process.terminate()
        if self.scan_process:
            self.scan_process.terminate()
        self.root.destroy()

if __name__ == "__main__":
    app = SSHTunnelManager()
    app.run()

