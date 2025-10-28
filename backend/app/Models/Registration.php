<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Registration extends Model
{
    use HasFactory;
    
    protected $fillable = [
        'whatsapp_id',
        'name',
        'nik',
        'branch_code',
        'date_requested',
        'status',
        'queue_number',
        'notes',
    ];

    // Status mapping (opsional tapi disarankan)
    protected $casts = [
        'date_requested' => 'date',
        'status' => 'string',
    ];
}
