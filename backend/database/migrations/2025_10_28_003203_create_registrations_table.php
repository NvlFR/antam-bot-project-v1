<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
Schema::create('registrations', function (Blueprint $table) {
            $table->id();
            
            // Data User
            $table->string('whatsapp_id', 15)->index()->comment('Nomor WA tanpa @s.whatsapp.net');
            $table->string('name')->nullable();
            $table->string('nik', 16);
            
            // Detail Pendaftaran
            $table->string('branch_code', 20)->index()->comment('Kode Cabang Antam, ex: BINTARO');
            $table->date('date_requested');
            
            // Status Otomatisasi
            $table->enum('status', ['pending', 'processing', 'success', 'failed'])
                  ->default('pending')->index();
            
            // Hasil Otomatisasi
            $table->string('queue_number')->nullable()->comment('Nomor antrian yang berhasil didapat');
            $table->text('notes')->nullable()->comment('Log/Pesan error dari proses Puppeteer');
            
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registrations');
    }
};
