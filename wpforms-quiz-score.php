<?php
/**
 * Plugin Name: WPForms Quiz Score
 * Description: Adiciona sistema de pontuação para formulários WPForms
 * Version: 1.0
 * Author: Manoel de Souza
 */

if (!defined('ABSPATH')) exit;

class WPForms_Quiz_Score {
    private $table_name;
    
    public function __construct() {
        global $wpdb;
        $this->table_name = $wpdb->prefix . 'wpforms_quiz_answers';
        
        error_log("📝 Quiz Score: Tabela configurada como: " . $this->table_name);
        
        // Move o registro do hook para fora do construtor
        register_activation_hook(__FILE__, array($this, 'create_answers_table'));
        
        // Hooks existentes
        add_action('wpforms_loaded', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_filter('wpforms_builder_settings_sections', array($this, 'add_settings_section'), 20, 2);
        add_filter('wpforms_form_settings_panel_content', array($this, 'add_settings_content'), 20);
        add_action('wp_ajax_save_quiz_settings', array($this, 'save_quiz_settings'));
    }

    public function init() {
        // Inicializa o plugin quando WPForms estiver carregado
    }

    public function enqueue_scripts() {
        wp_enqueue_script(
            'wpforms-quiz-score',
            plugins_url('js/quiz-score.js', __FILE__),
            array('jquery'),
            '1.0.' . time(),
            true
        );

        wp_enqueue_style(
            'wpforms-quiz-score',
            plugins_url('css/quiz-score.css', __FILE__),
            array(),
            '1.0.' . time()
        );

        // Passa as respostas corretas para o JavaScript
        $form_data = $this->get_form_data();
        wp_localize_script('wpforms-quiz-score', 'wpformsQuizData', array(
            'respostas' => $form_data
        ));
    }

    public function add_settings_section($sections, $form_data) {
        $sections['quiz_score'] = 'Opções de Pontuação';
        return $sections;
    }

    public function add_settings_content($instance) {
        global $wpdb;
        
        // Debug inicial
        error_log('🔍 Iniciando debug da tela de criação de formulário');

        // Busca os formulários
        $forms = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}posts WHERE post_type = 'wpforms'");
        error_log('Formulários encontrados com sucesso!');

        // Adicionar JavaScript para debug na tela de criação
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            console.group('🎯 WPForms Quiz Score - Debug Builder');
            
            // Debug dos formulários disponíveis
            console.log('Formulários carregados:', <?php echo json_encode($forms); ?>);
            
            // Debug quando salvar configurações
            $('#save-quiz-settings').on('click', function(e) {
                console.group('💾 Salvando Configurações');
                
                var settings = {};
                $('.quiz-question-settings select').each(function() {
                    var name = $(this).attr('name');
                    var value = $(this).val();
                    settings[name] = value;
                    console.log('Campo:', name, 'Valor:', value);
                });
                
                console.log('Configurações a serem salvas:', settings);
                console.groupEnd();
            });

            // Debug de campos do formulário
            $('.wpforms-field').each(function() {
                console.log('Campo encontrado:', {
                    id: $(this).data('field-id'),
                    type: $(this).data('field-type'),
                    label: $(this).find('.label-title').text()
                });
            });

            // Debug quando selecionar resposta correta
            $(document).on('change', '.quiz-question-settings select', function() {
                console.log('Resposta selecionada:', {
                    field: $(this).attr('name'),
                    value: $(this).val()
                });
            });

            console.groupEnd();
        });
        </script>
        <?php

        // Continua com o código original...
        echo '<div class="wpforms-panel-content-section wpforms-panel-content-section-quiz_score">';
        echo '<div class="wpforms-panel-content-section-title">';
        echo 'Configurações de Pontuação';
        echo '</div>';
        
        if (empty($forms)) {
            error_log('⚠️ Nenhum formulário encontrado');
            echo '<div class="wpforms-setting-row">';
            echo '<p>Nenhum formulário encontrado. Crie um formulário com campos de múltipla escolha ou seleção primeiro.</p>';
            echo '</div>';
            return;
        }

        foreach ($forms as $form) {
            $form_data = json_decode($form->post_content, true);

            if (!empty($form_data['fields'])) {
                $has_quiz_fields = false;
                
                echo '<div class="quiz-form-section">';
                echo '<h3>Formulário: ' . esc_html($form_data['settings']['form_title']) . '</h3>';
                
                foreach ($form_data['fields'] as $field) {
                    if (in_array($field['type'], ['radio', 'select'])) {
                        $has_quiz_fields = true;
                        $saved_answer = $this->get_saved_answer($form->ID, $field['id']);
                        
                        echo '<div class="quiz-question-settings">';
                        echo '<div class="quiz-question-info">';
                        echo '<p><strong>Pergunta:</strong> ' . esc_html($field['label']) . '</p>';
                        echo '<span>Tipo: ' . ucfirst($field['type']) . ' | ID: ' . $field['id'] . '</span>';
                        echo '</div>';
                        
                        echo '<label>Selecione a resposta correta:</label>';
                        echo '<select name="quiz_correct_answer_' . $form->ID . '_' . $field['id'] . '" 
                                 data-form-id="' . $form->ID . '" 
                                 data-field-id="' . $field['id'] . '" 
                                 class="quiz-answer-select">';
                        echo '<option value="">Selecione uma resposta</option>';
                        
                        if (!empty($field['choices'])) {
                            foreach ($field['choices'] as $choice_id => $choice) {
                                $selected = ($saved_answer == $choice['label']) ? 'selected' : '';
                                echo '<option value="' . esc_attr($choice['label']) . '" ' . $selected . '>';
                                echo esc_html($choice['label']);
                                echo '</option>';
                            }
                        }
                        
                        echo '</select>';
                        echo '</div>';
                    }
                }
                
                if (!$has_quiz_fields) {
                    echo '<p>Este formulário não possui campos de múltipla escolha ou seleção.</p>';
                }
                
                echo '</div>';
            }
        }
        
        echo '<div class="wpforms-setting-row quiz-save-button">';
        echo '<button class="wpforms-btn wpforms-btn-primary" id="save-quiz-settings">Salvar Configurações</button>';
        echo '<span class="spinner" style="float: none; margin-left: 10px;"></span>';
        echo '</div>';
        
        echo '</div>';

        // Atualiza o JavaScript para melhor feedback
        $this->add_settings_script();
    }

    public function create_answers_table() {
        global $wpdb;
        
        try {
            error_log('📝 Quiz Score: Iniciando criação da tabela');
            
            $charset_collate = $wpdb->get_charset_collate();
            $table_name = $wpdb->prefix . 'wpforms_quiz_answers';
            
            // SQL para criar a tabela
            $sql = "CREATE TABLE IF NOT EXISTS $table_name (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                form_id bigint(20) NOT NULL,
                field_id bigint(20) NOT NULL,
                correct_answer text NOT NULL,
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY  (id),
                UNIQUE KEY form_field (form_id,field_id)
            ) $charset_collate;";
            
            require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
            
            // Tenta criar a tabela
            $result = dbDelta($sql);
            error_log('Resultado do dbDelta: ' . print_r($result, true));
            
            // Verifica se a tabela foi criada
            $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table_name'") === $table_name;
            
            if ($table_exists) {
                error_log("✅ Quiz Score: Tabela $table_name criada/atualizada com sucesso");
            } else {
                error_log("❌ Quiz Score: Erro ao criar tabela $table_name");
                error_log("Último erro MySQL: " . $wpdb->last_error);
            }
            
        } catch (Exception $e) {
            error_log("❌ Quiz Score: Exceção ao criar tabela - " . $e->getMessage());
        }
    }

    public function save_quiz_settings() {
        error_log('📝 Quiz Score: Requisição recebida');
        
        // Verifica nonce
        if (!check_ajax_referer('wpforms-builder', 'nonce', false)) {
            error_log('❌ Quiz Score: Nonce inválido');
            wp_send_json_error(['message' => 'Nonce inválido']);
            return;
        }
        
        if (empty($_POST['settings'])) {
            error_log('❌ Quiz Score: Nenhuma configuração recebida');
            wp_send_json_error(['message' => 'Nenhuma configuração recebida']);
            return;
        }
        
        $settings = $_POST['settings'];
        $success = true;
        $saved_count = 0;
        
        error_log('📝 Quiz Score: Processando configurações: ' . print_r($settings, true));
        
        foreach ($settings as $key => $value) {
            // Se value for array, converte para string para debug
            $value_str = is_array($value) ? json_encode($value) : $value;
            error_log("Processando resposta - Chave: $key, Valor: $value_str");
            
            // Extrai form_id e field_id da chave
            if (is_array($value) && isset($value['form_id']) && isset($value['field_id'])) {
                $form_id = intval($value['form_id']);
                $field_id = intval($value['field_id']);
                $answer = sanitize_text_field($value['answer']);
                
                error_log("Tentando salvar - Form: $form_id, Campo: $field_id, Resposta: $answer");
                
                if ($this->save_correct_answer($form_id, $field_id, $answer)) {
                    $saved_count++;
                    error_log("✅ Resposta salva com sucesso");
                } else {
                    $success = false;
                    error_log("❌ Erro ao salvar resposta");
                }
            } else {
                error_log("❌ Formato inválido para a resposta: " . print_r($value, true));
            }
        }
        
        $response = [
            'message' => $success ? "$saved_count respostas salvas com sucesso" : 'Erro ao salvar respostas',
            'saved_count' => $saved_count
        ];
        
        error_log('📝 Quiz Score: Finalizando - ' . ($success ? '✅ Sucesso' : '❌ Erro'));
        
        if ($success) {
            wp_send_json_success($response);
        } else {
            wp_send_json_error($response);
        }
    }

    private function save_correct_answer($form_id, $field_id, $answer) {
        global $wpdb;
        
        error_log("📝 Quiz Score: Tentando salvar na tabela: " . $this->table_name);
        error_log("Dados: Form ID = $form_id, Field ID = $field_id, Resposta = $answer");
        
        // Verifica se a tabela existe
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '{$this->table_name}'") === $this->table_name;
        if (!$table_exists) {
            error_log("❌ Quiz Score: Tabela {$this->table_name} não existe!");
            return false;
        }
        
        // Tenta inserir/atualizar no banco
        $result = $wpdb->replace(
            $this->table_name,
            array(
                'form_id' => $form_id,
                'field_id' => $field_id,
                'correct_answer' => sanitize_text_field($answer)
            ),
            array('%d', '%d', '%s')
        );
        
        if ($result === false) {
            error_log("❌ Quiz Score: Erro ao salvar - " . $wpdb->last_error);
            return false;
        }
        
        error_log("✅ Quiz Score: Resposta salva com sucesso na tabela {$this->table_name}");
        return true;
    }

    private function get_saved_answer($form_id, $field_id) {
        global $wpdb;
        
        $answer = $wpdb->get_var($wpdb->prepare(
            "SELECT correct_answer 
            FROM {$this->table_name} 
            WHERE form_id = %d 
            AND field_id = %d",
            $form_id,
            $field_id
        ));
        
        error_log("Buscando resposta - Form ID: $form_id, Field ID: $field_id, Resposta: " . ($answer ?: 'não encontrada'));
        
        return $answer;
    }

    private function add_settings_script() {
        ?>
        <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#save-quiz-settings').on('click', function(e) {
                e.preventDefault();
                console.log('🎯 Iniciando salvamento...');
                
                // Coleta as respostas
                var settings = {};
                $('.quiz-question-settings select').each(function() {
                    var $select = $(this);
                    var form_id = $select.data('form-id');
                    var field_id = $select.data('field-id');
                    var answer = $select.val();
                    
                    if (answer && answer !== '') {
                        // Estrutura correta dos dados
                        var key = 'quiz_correct_answer_' + form_id + '_' + field_id;
                        settings[key] = {
                            form_id: form_id,
                            field_id: field_id,
                            answer: answer
                        };
                        
                        console.log('Resposta coletada:', {
                            form_id: form_id,
                            field_id: field_id,
                            answer: answer
                        });
                    }
                });
                
                // Debug
                console.log('Dados a serem enviados:', settings);
                
                // Se não houver respostas selecionadas
                if (Object.keys(settings).length === 0) {
                    alert('Por favor, selecione pelo menos uma resposta correta.');
                    return;
                }
                
                // Mostra loading
                var $button = $(this);
                var $spinner = $button.next('.spinner');
                $button.prop('disabled', true);
                $spinner.css('visibility', 'visible');
                
                // Envia para o servidor
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'save_quiz_settings',
                        nonce: '<?php echo wp_create_nonce("wpforms-builder"); ?>',
                        settings: settings
                    },
                    success: function(response) {
                        console.log('Resposta:', response);
                        if (response.success) {
                            alert('✅ ' + response.data.message);
                        } else {
                            alert('❌ ' + response.data.message);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Erro:', error);
                        alert('Erro ao salvar configurações');
                    },
                    complete: function() {
                        $button.prop('disabled', false);
                        $spinner.css('visibility', 'hidden');
                    }
                });
            });
        });
        </script>
        <?php
    }

    public function get_form_data() {
        global $wpdb;
        
        $current_form_id = isset($_GET['form_id']) ? absint($_GET['form_id']) : 0;
        
        if (!$current_form_id) {
            error_log('Form ID não encontrado');
            return array();
        }
        
        error_log('Buscando respostas para o formulário: ' . $current_form_id);
        
        $answers = $wpdb->get_results($wpdb->prepare(
            "SELECT field_id, correct_answer 
            FROM {$this->table_name} 
            WHERE form_id = %d",
            $current_form_id
        ));
        
        $form_data = array();
        
        foreach ($answers as $answer) {
            $form_data[$answer->field_id] = $answer->correct_answer;
            error_log("Resposta carregada - Field ID: {$answer->field_id}, Valor: {$answer->correct_answer}");
        }
        
        error_log('Dados do formulário recuperados: ' . print_r($form_data, true));
        return $form_data;
    }
}

// Instancia a classe fora
$wpforms_quiz = new WPForms_Quiz_Score();

// Registra o hook de ativação separadamente
register_activation_hook(__FILE__, array($wpforms_quiz, 'create_answers_table')); 